import { MANUAL_FIELDS, RUNS_SHEET } from "../models/constants.js";
import {
  COLUMN_COUNT,
  LAST_COLUMN_LETTER,
  RUNS_COLUMNS,
  columnLetter,
  completionFormulaForRow,
  deserializeRow,
  headerRow,
  serializeRecord,
} from "../models/runRecord.js";

const COMPLETION_COLUMN_INDEX = RUNS_COLUMNS.findIndex((column) => column.type === "formula");
const COMPLETION_COLUMN_LETTER = columnLetter(COMPLETION_COLUMN_INDEX);

/**
 * Reads the Runs sheet back into normalised records.
 *
 * Reading uses UNFORMATTED_VALUE so durations come back as day fractions and
 * dates as serial numbers, which `deserializeRow` converts back to ms.
 */
export const readRunsSheet = async ({ backend, capacity = 2500 }) => {
  const range = `${RUNS_SHEET}!A1:${LAST_COLUMN_LETTER}${capacity}`;
  const values = await backend.readValues(range);
  const header = values[0] ?? [];
  // The Sheets API omits trailing empty rows, but local backends may return
  // a padded grid - either way, only rows with a Match ID are records.
  const dataRows = values.slice(1);

  const records = [];
  dataRows.forEach((cells) => {
    if (!cells || cells.length === 0) return;
    const record = deserializeRow(cells);
    if (record.matchId === undefined) return;
    records.push(record);
  });

  return { header, dataRows, records };
};

/** True when the sheet's header row matches the expected schema exactly. */
export const headerMatches = (header = []) => {
  const expected = headerRow();
  return expected.every((label, index) => header[index] === label);
};

/**
 * Merges freshly normalised API records with the sheet's existing rows.
 *
 * Rules:
 *   - API-owned fields come from the API payload.
 *   - MANUAL_FIELDS always come from the sheet (never from the API).
 *   - Matches that are not re-fetched keep the values already in the sheet.
 *
 * @param {Object} args
 * @param {Array<Object>} args.sheetRecords records read from the sheet
 * @param {Map<number, Object>} args.normalizedById fresh API records by match id
 */
export const buildRecordSet = ({ sheetRecords = [], normalizedById = new Map() } = {}) => {
  const byId = new Map();

  for (const record of sheetRecords) {
    if (record.matchId === undefined) continue;
    byId.set(record.matchId, { ...record });
  }

  for (const [matchId, apiRecord] of normalizedById) {
    const existing = byId.get(matchId);
    const merged = { ...(existing ?? {}), ...apiRecord };
    for (const key of MANUAL_FIELDS) {
      if (existing && existing[key] !== undefined) {
        merged[key] = existing[key];
      } else {
        delete merged[key];
      }
    }
    byId.set(matchId, merged);
  }

  return [...byId.values()];
};

/**
 * Compares a desired cell with the value currently stored in the sheet.
 * Durations/dates are compared with a tolerance because they are day fractions.
 */
export const cellEquals = (desired, actual, type) => {
  const left = desired === undefined ? "" : desired;
  const right = actual === undefined || actual === null ? "" : actual;

  if (left === "" && right === "") return true;

  if (type === "duration" || type === "datetime") {
    if (typeof left !== "number" || typeof right !== "number") return left === right;
    // Serial rounding: 1ms is ~1.16e-8 of a day, so anything within 2ms has
    // not meaningfully changed and should not be rewritten.
    return Math.abs(left - right) < 2.5e-8;
  }
  if (type === "bool") return Boolean(left) === Boolean(right);
  if (typeof left === "number" || typeof right === "number") return Number(left) === Number(right);
  return String(left) === String(right);
};

/**
 * Builds the minimal set of writes for the Runs sheet.
 *
 * Only cells whose value actually changed are written, which is what makes the
 * "never overwrite manual fields" guarantee structural rather than best-effort:
 * an unchanged manual cell is simply not part of any update.
 *
 * The `Completion` (formula) column is excluded here and written separately,
 * because formula cells must be sent with USER_ENTERED.
 */
export const planRunsUpdates = ({ records = [], existingRows = [], sheetTitle = RUNS_SHEET } = {}) => {
  const updates = [];
  const formulaRows = [];

  records.forEach((record, index) => {
    const sheetRow = index + 2;
    const desired = serializeRecord(record);
    const existing = existingRows[index] ?? [];

    let runStart = null;
    const flush = (start, end) => {
      updates.push({
        range: `${sheetTitle}!${columnLetterFor(start)}${sheetRow}:${columnLetterFor(end)}${sheetRow}`,
        values: [desired.slice(start, end + 1)],
        majorDimension: "ROWS",
      });
    };

    for (let column = 0; column < desired.length; column += 1) {
      if (RUNS_COLUMNS[column].type === "formula") {
        if (runStart !== null) flush(runStart, column - 1);
        runStart = null;
        continue;
      }
      const equal = cellEquals(desired[column], existing[column], RUNS_COLUMNS[column].type);
      if (!equal && runStart === null) runStart = column;
      if (equal && runStart !== null) {
        flush(runStart, column - 1);
        runStart = null;
      }
    }
    if (runStart !== null) flush(runStart, desired.length - 1);

    formulaRows.push([completionFormulaForRow(sheetRow)]);
  });

  const clearUpdate =
    existingRows.length > records.length
      ? {
          range: `${sheetTitle}!A${records.length + 2}:${LAST_COLUMN_LETTER}${existingRows.length + 1}`,
          values: Array.from({ length: existingRows.length - records.length }, () =>
            Array.from({ length: COLUMN_COUNT }, () => ""),
          ),
          majorDimension: "ROWS",
        }
      : null;

  return { updates, formulaRows, clearUpdate };
};

// Local helper so the flush closure stays readable.
const columnLetterFor = (index) => columnLetter(index);

/**
 * Applies the planned writes to the backend.
 *
 * Data cells go in with RAW so user text is never reinterpreted as a formula or
 * a number; the generated `Completion` formula column goes in with
 * USER_ENTERED so Sheets evaluates it.
 *
 * @returns {{rawUpdateCount: number, formulaCellCount: number, updates: Object[]}}
 */
export const writeRunsSheet = async ({ backend, plan, dryRun = false }) => {
  const rawUpdates = [...plan.updates];
  if (plan.clearUpdate) rawUpdates.push(plan.clearUpdate);

  const formulaUpdates =
    plan.formulaRows.length > 0
      ? [
          {
            range: `${RUNS_SHEET}!${COMPLETION_COLUMN_LETTER}2:${COMPLETION_COLUMN_LETTER}${plan.formulaRows.length + 1}`,
            values: plan.formulaRows,
            majorDimension: "ROWS",
          },
        ]
      : [];

  const updates = [...rawUpdates, ...formulaUpdates];
  if (dryRun || updates.length === 0) {
    return { rawUpdateCount: rawUpdates.length, formulaCellCount: plan.formulaRows.length, updates };
  }

  if (rawUpdates.length > 0) {
    await backend.batchUpdateValues({ updates: rawUpdates, valueInputOption: "RAW" });
  }
  if (formulaUpdates.length > 0) {
    await backend.batchUpdateValues({ updates: formulaUpdates, valueInputOption: "USER_ENTERED" });
  }

  return { rawUpdateCount: rawUpdates.length, formulaCellCount: plan.formulaRows.length, updates };
};

