/**
 * Spreadsheet backends.
 *
 * The sync engine only ever talks to this interface, so the Google Sheets
 * implementation can be swapped for a local file backend (or an Excel backend
 * later) without touching the data model, the classifier or the timeline parser.
 *
 * Interface:
 *   ensureSheet(title)
 *   getSheetTitles()
 *   readValues(a1Range)               -> any[][]
 *   batchUpdateValues(updates)        -> [{range, values, valueInputOption}]
 *   batchUpdateSpreadsheet(requests)  -> raw Sheets API requests (formatting,
 *                                        validation, frozen rows, filters)
 *   createSpreadsheet(title)          -> { spreadsheetId }
 *   getSheetMetadata()                -> [{ title, sheetId, index,
 *                                           conditionalFormatRuleCount }]
 */

/** Parses "Sheet!A2:AB7" / "A2" / "Sheet!A:A" into coordinates (1-based). */
export const parseA1Range = (a1) => {
  const bang = a1.lastIndexOf("!");
  const sheetTitle = bang === -1 ? null : a1.slice(0, bang).replace(/^'|'$/g, "");
  const ref = bang === -1 ? a1 : a1.slice(bang + 1);

  const colToIndex = (letters) => {
    let value = 0;
    for (const char of letters.toUpperCase()) {
      value = value * 26 + (char.charCodeAt(0) - 64);
    }
    return value - 1;
  };

  const match = /^([A-Za-z]*)(\d*):?([A-Za-z]*)(\d*)$/.exec(ref.trim());
  if (!match) throw new Error(`Cannot parse A1 range "${a1}".`);
  const [, startCol, startRow, endCol, endRow] = match;

  return {
    sheetTitle,
    startCol: startCol ? colToIndex(startCol) : 0,
    startRow: startRow ? Number(startRow) - 1 : 0,
    endCol: endCol ? colToIndex(endCol) : startCol ? colToIndex(startCol) : 0,
    endRow: endRow ? Number(endRow) - 1 : startRow ? Number(startRow) - 1 : 0,
  };
};

const trimTrailing = (row) => {
  const copy = [...row];
  while (copy.length > 0 && (copy[copy.length - 1] === "" || copy[copy.length - 1] === undefined)) {
    copy.pop();
  }
  return copy;
};

const isEmpty = (value) => value === undefined || value === null || value === "";

/** In-memory spreadsheet used by tests, `--dry-run` and `MCSR_BACKEND=memory`. */
export class MemoryBackend {
  constructor({ capacityRows = 5000, capacityColumns = 40, title = "memory" } = {}) {
    this.title = title;
    this.capacityRows = capacityRows;
    this.capacityColumns = capacityColumns;
    this.sheets = new Map();
    this.sheetRequests = [];
    this.valueRequests = [];
  }

  async createSpreadsheet(name) {
    this.title = name;
    return { spreadsheetId: "memory-spreadsheet" };
  }

  async getSheetTitles() {
    return [...this.sheets.keys()];
  }

  async ensureSheet(title) {
    if (!this.sheets.has(title)) {
      this.sheets.set(title, {
        title,
        sheetId: this.sheets.size,
        index: this.sheets.size,
        rows: [],
        // Mirrors Sheet.conditionalFormats so init idempotency can be tested
        // offline exactly the way the live API behaves.
        conditionalFormats: [],
      });
    }
    return this.sheets.get(title);
  }

  async getSheetMetadata() {
    return [...this.sheets.values()].map(({ title, sheetId, index, conditionalFormats }) => ({
      title,
      sheetId,
      index,
      conditionalFormatRuleCount: (conditionalFormats ?? []).length,
    }));
  }

  setCell(sheet, rowIndex, colIndex, value) {
    while (sheet.rows.length <= rowIndex) sheet.rows.push([]);
    const row = sheet.rows[rowIndex];
    while (row.length <= colIndex) row.push("");
    row[colIndex] = value;
  }

  async readValues(a1) {
    const { sheetTitle, startCol, startRow, endCol, endRow } = parseA1Range(a1);
    const sheet = this.sheets.get(sheetTitle);
    if (!sheet) return [];
    const out = [];
    for (let r = startRow; r <= endRow; r += 1) {
      const row = sheet.rows[r] ?? [];
      const slice = [];
      for (let c = startCol; c <= endCol; c += 1) slice.push(row[c] ?? "");
      out.push(trimTrailing(slice));
    }
    // Mimic the Sheets API: trailing fully-empty rows are omitted, so a fresh
    // sheet reads back as header + no data rows (not a padded grid).
    while (out.length > 0 && out[out.length - 1].length === 0) out.pop();
    return out;
  }

  async batchUpdateValues({ updates = [] } = {}) {
    this.valueRequests.push({ updates });
    for (const update of updates) {
      const { sheetTitle, startCol, startRow } = parseA1Range(update.range);
      const sheet = await this.ensureSheet(sheetTitle);
      (update.values ?? []).forEach((row, rOffset) => {
        (row ?? []).forEach((value, cOffset) => {
          // Empty strings are written too: that is how a cell gets cleared when
          // an API-owned value no longer applies.
          this.setCell(sheet, startRow + rOffset, startCol + cOffset, value ?? "");
        });
      });
    }
    return { totalUpdatedCells: this.valueRequests.length };
  }

  findSheetById(sheetId) {
    for (const sheet of this.sheets.values()) {
      if (sheet.sheetId === sheetId) return sheet;
    }
    return null;
  }

  /**
   * Records formatting requests and mirrors the conditional-format rule list
   * (add / delete / update by index) exactly like the live API, so repeated
   * `initializeSheets` runs can be asserted to stay idempotent offline.
   */
  async batchUpdateSpreadsheet({ requests = [] } = {}) {
    for (const request of requests) {
      const [type] = Object.keys(request);
      const payload = request[type] ?? {};
      // addConditionalFormatRule carries no top-level sheetId: the target
      // sheet lives in rule.ranges[0].sheetId (delete/update do have one).
      const sheet = this.findSheetById(payload.sheetId ?? payload.rule?.ranges?.[0]?.sheetId);
      if (!sheet) continue;
      const rules = sheet.conditionalFormats ?? (sheet.conditionalFormats = []);
      if (type === "addConditionalFormatRule") {
        const index = Math.min(payload.index ?? rules.length, rules.length);
        rules.splice(index, 0, payload.rule);
      } else if (type === "deleteConditionalFormatRule") {
        if (payload.index >= 0 && payload.index < rules.length) rules.splice(payload.index, 1);
      } else if (type === "updateConditionalFormatRule") {
        if (payload.rule !== undefined && payload.index < rules.length) {
          rules[payload.index] = payload.rule;
        }
        if (payload.newIndex !== undefined && payload.index < rules.length) {
          const [moved] = rules.splice(payload.index, 1);
          rules.splice(payload.newIndex, 0, moved);
        }
      }
    }
    this.sheetRequests.push(...requests);
    return { replies: requests.map(() => ({})) };
  }

  /**
   * Clears VALUES inside an A1 range (formatting, filters and validation are
   * untouched - there are none in memory, but the contract matches Google).
   * Used by `npm run reset`.
   */
  async clearRange(a1) {
    const { sheetTitle, startCol, startRow, endCol, endRow } = parseA1Range(a1);
    const sheet = this.sheets.get(sheetTitle);
    if (!sheet) return { clearedCells: 0 };
    let clearedCells = 0;
    for (let r = startRow; r <= endRow && r < sheet.rows.length; r += 1) {
      const row = sheet.rows[r];
      if (!row) continue;
      for (let c = startCol; c <= endCol && c < row.length; c += 1) {
        if (row[c] !== "" && row[c] !== undefined) {
          row[c] = "";
          clearedCells += 1;
        }
      }
      // Trim trailing empties so reads behave exactly like a fresh sheet.
      while (row.length > 0 && (row[row.length - 1] === "" || row[row.length - 1] === undefined)) {
        row.pop();
      }
    }
    while (sheet.rows.length > 1 && (sheet.rows[sheet.rows.length - 1]?.length ?? 0) === 0) {
      sheet.rows.pop();
    }
    return { clearedCells };
  }
}
