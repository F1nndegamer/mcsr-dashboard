import { COMPLETION_TYPES, DASHBOARD_SHEET, RUNS_SHEET } from "../models/constants.js";
import {
  COLUMN_COUNT,
  COLUMN_INDEX,
  COLUMN_LETTERS,
  RUNS_COLUMNS,
  RUNS_SECTIONS,
  headerRow,
} from "../models/runRecord.js";

export {
  RUNS_SHEET,
  DASHBOARD_SHEET,
  headerRow,
  RUNS_COLUMNS,
  COLUMN_LETTERS,
  RUNS_SECTIONS,
};
export const SHEET_TITLES = [RUNS_SHEET, DASHBOARD_SHEET];

/**
 * Restrained palette: green = success, red = failure, amber = warning,
 * purple/blue = special, gray = neutral. Backgrounds stay soft so long
 * stretches of rows never become hard to read.
 */
const COLOR = {
  headerA: { red: 0.122, green: 0.165, blue: 0.216 },
  headerB: { red: 0.173, green: 0.227, blue: 0.29 },
  headerResult: { red: 0.071, green: 0.267, blue: 0.18 },
  white: { red: 1, green: 1, blue: 1 },
  separator: { red: 0.796, green: 0.831, blue: 0.867 },
  headerRule: { red: 0.09, green: 0.13, blue: 0.17 },
  greenBg: { red: 0.878, green: 0.949, blue: 0.89 },
  greenFg: { red: 0.086, green: 0.35, blue: 0.17 },
  redBg: { red: 0.984, green: 0.886, blue: 0.886 },
  redFg: { red: 0.6, green: 0.13, blue: 0.13 },
  amberBg: { red: 0.996, green: 0.949, blue: 0.835 },
  amberFg: { red: 0.57, green: 0.36, blue: 0.02 },
  purpleBg: { red: 0.914, green: 0.902, blue: 0.941 },
  purpleFg: { red: 0.35, green: 0.29, blue: 0.55 },
  blueBg: { red: 0.894, green: 0.925, blue: 0.976 },
  blueFg: { red: 0.15, green: 0.3, blue: 0.6 },
  grayBg: { red: 0.937, green: 0.945, blue: 0.953 },
  grayFg: { red: 0.36, green: 0.4, blue: 0.44 },
  orangeBg: { red: 0.996, green: 0.925, blue: 0.863 },
  orangeFg: { red: 0.66, green: 0.3, blue: 0.06 },
  bandBg: { red: 0.969, green: 0.976, blue: 0.984 },
  timeMin: { red: 0.847, green: 0.937, blue: 0.855 },
  timeMid: { red: 1, green: 1, blue: 1 },
  timeMax: { red: 0.988, green: 0.914, blue: 0.882 },
  accentBlue: { red: 0.11, green: 0.31, blue: 0.62 },
};

/** Header shading per section (same order as RUNS_SECTIONS). */
const SECTION_HEADER_COLORS = [
  COLOR.headerA, // IDENTIFICATION
  COLOR.headerResult, // RESULT (the focal field, tinted green)
  COLOR.headerB, // OVERWORLD
  COLOR.headerA, // NETHER
  COLOR.headerB, // END
  COLOR.headerA, // FINAL
  COLOR.headerB, // RANKED
  COLOR.headerA, // USER
];

const NUMBER_TYPES = {
  datetime: "DATE_TIME",
  duration: "TIME",
  int: "NUMBER",
  manualInt: "NUMBER",
  manualCompletion: "NUMBER",
  apiSeededInt: "NUMBER",
};

const LEFT_ALIGNED = new Set(["text", "manualText"]);

/** Comfortable reading widths; text columns breathe, flags stay narrow. */
const COLUMN_WIDTHS = {
  runNumber: 58,
  matchNumber: 64,
  matchId: 92,
  dateMs: 134,
  season: 62,
  opponent: 118,
  result: 90,
  countsToward1000: 116,
  seed: 158,
  seedType: 118,
  owSplitMs: 94,
  netherSplitMs: 98,
  bastionType: 104,
  bastionTimeMs: 96,
  endSplitMs: 94,
  endTowers: 118,
  completionType: 104,
  completion: 104,
  finalTimeMs: 102,
  deaths: 64,
  deathMessages: 200,
  eloBefore: 84,
  eloChange: 82,
  eloAfter: 82,
  notes: 220,
  dataStatus: 106,
};

/**
 * Builds every `batchUpdate` request needed to make the Runs sheet usable:
 * frozen header + id columns, filters, section-styled headers, separator
 * borders, readable number formats, column widths, the Completion Type
 * dropdown and the conditional formatting rules. Applied by
 * `npm run init-sheet`.
 *
 * `existingConditionalFormatRuleCount` is how many conditional-format rules the
 * sheet already has (read from spreadsheet metadata before init). The Sheets
 * API has NO "clear all conditional formats" request - rules are only added,
 * deleted or updated **by index** - so every existing rule is deleted first,
 * from the highest index down (descending order stays valid whether the API
 * resolves indexes against the evolving list or the original one), then our
 * rules are re-added. Repeated `init-sheet` runs therefore never duplicate
 * rules and never touch anything outside this sheet's conditional formats.
 */
export const runsSheetSetupRequests = ({
  sheetId,
  capacity = 2500,
  currentRowCount = 1000,
  existingConditionalFormatRuleCount = 0,
} = {}) => {
  const requests = [];

  // --- grid size -------------------------------------------------------------
  if (currentRowCount < capacity) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { rowCount: capacity, columnCount: COLUMN_COUNT },
        },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    });
  }

  // --- freeze header row + the Run #/Match # id columns ---------------------
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 },
      },
      fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
    },
  });

  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: capacity,
          startColumnIndex: 0,
          endColumnIndex: COLUMN_COUNT,
        },
      },
    },
  });

  // --- column widths ---------------------------------------------------------
  RUNS_COLUMNS.forEach((column, index) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize: COLUMN_WIDTHS[column.key] ?? 96 },
        fields: "pixelSize",
      },
    });
  });

  // --- section-styled header cells ------------------------------------------
  RUNS_SECTIONS.forEach((section, sectionIndex) => {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: section.startIndex,
          endColumnIndex: section.endIndex + 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: COLOR.white },
            backgroundColor: SECTION_HEADER_COLORS[sectionIndex] ?? COLOR.headerA,
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
            wrapStrategy: "WRAP",
          },
        },
        fields:
          "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.wrapStrategy",
      },
    });
  });

  // --- header rule + section separator borders (no blank spacer columns) -----
  requests.push({
    updateBorders: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: COLUMN_COUNT,
      },
      bottom: { style: "SOLID_MEDIUM", color: COLOR.headerRule },
    },
  });
  RUNS_SECTIONS.filter((section) => section.startIndex > 0).forEach((section) => {
    requests.push({
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: capacity,
          startColumnIndex: section.startIndex,
          endColumnIndex: section.startIndex + 1,
        },
        left: { style: "SOLID", color: COLOR.separator },
      },
    });
  });

  // --- body: number formats + alignment per column --------------------------
  RUNS_COLUMNS.forEach((column, index) => {
    const numberType = NUMBER_TYPES[column.type];
    const format = {
      horizontalAlignment: LEFT_ALIGNED.has(column.type) ? "LEFT" : "CENTER",
      verticalAlignment: "MIDDLE",
    };
    const fields = [
      "userEnteredFormat.horizontalAlignment",
      "userEnteredFormat.verticalAlignment",
    ];
    if (column.numberFormat && numberType) {
      format.numberFormat = { type: numberType, pattern: column.numberFormat };
      fields.push("userEnteredFormat.numberFormat");
    }
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: capacity,
          startColumnIndex: index,
          endColumnIndex: index + 1,
        },
        cell: { userEnteredFormat: format },
        fields: fields.join(","),
      },
    });
  });

  // --- Completion Type dropdown ---------------------------------------------
  requests.push({
    setDataValidation: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: capacity,
        startColumnIndex: COLUMN_INDEX.completionType,
        endColumnIndex: COLUMN_INDEX.completionType + 1,
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: COMPLETION_TYPES.map((entry) => ({ userEnteredValue: String(entry.value) })),
        },
        strict: true,
        showCustomUi: true,
        inputMessage: COMPLETION_TYPES.map((entry) => `${entry.value} = ${entry.label}`).join("  |  "),
      },
    },
  });

  // --- conditional formatting (delete existing rules first so re-init never
  // duplicates). No "clear all rules" request exists in the Sheets API, so the
  // pre-existing rules are removed one by one, highest index first, before the
  // full set is re-added. -----------------------------------------------
  for (let index = existingConditionalFormatRuleCount - 1; index >= 0; index -= 1) {
    requests.push({ deleteConditionalFormatRule: { index, sheetId } });
  }
  conditionalFormatRules({ sheetId, capacity }).forEach((rule, ruleIndex) => {
    requests.push({ addConditionalFormatRule: { rule, index: ruleIndex } });
  });

  return requests;
};

/** Column range (A1) for one column, excluding the header row. */
export const columnRange = (key, firstRow, lastRow) =>
  `${COLUMN_LETTERS[COLUMN_INDEX[key]]}${firstRow}:${COLUMN_LETTERS[COLUMN_INDEX[key]]}${lastRow}`;

/** Body range (rows 2..capacity) for one column key. */
const bodyRange = (sheetId, capacity, key) => ({
  sheetId,
  startRowIndex: 1,
  endRowIndex: capacity,
  startColumnIndex: COLUMN_INDEX[key],
  endColumnIndex: COLUMN_INDEX[key] + 1,
});

const letter = (key) => COLUMN_LETTERS[COLUMN_INDEX[key]];

const textEqRule = (range, text, format) => ({
  ranges: [range],
  booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: text }] }, format },
});

const customRule = (range, formula, format) => ({
  ranges: [range],
  booleanRule: { condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] }, format },
});

/**
 * Conditional formatting rules in strict priority order (index 0 wins).
 * Specific semantic rules come first; the nearly-invisible alternating row
 * tint is registered last so it never overrides a semantic colour.
 */
const conditionalFormatRules = ({ sheetId, capacity }) => {
  const col = (key) => bodyRange(sheetId, capacity, key);
  const rules = [];

  // --- Result: WIN / LOSS / DRAW / FORFEIT ---------------------------------
  const result = col("result");
  rules.push(
    textEqRule(result, "WIN", {
      backgroundColor: COLOR.greenBg,
      textFormat: { foregroundColor: COLOR.greenFg, bold: true },
    }),
    textEqRule(result, "LOSS", {
      backgroundColor: COLOR.redBg,
      textFormat: { foregroundColor: COLOR.redFg, bold: true },
    }),
    textEqRule(result, "DRAW", {
      backgroundColor: COLOR.amberBg,
      textFormat: { foregroundColor: COLOR.amberFg, bold: true },
    }),
    textEqRule(result, "FORFEIT", {
      backgroundColor: COLOR.purpleBg,
      textFormat: { foregroundColor: COLOR.purpleFg, bold: true },
    }),
  );

  // --- Counts Toward 1000 ----------------------------------------------------
  const counts = col("countsToward1000");
  rules.push(
    customRule(counts, `=${letter("countsToward1000")}2=TRUE`, {
      backgroundColor: COLOR.greenBg,
      textFormat: { foregroundColor: COLOR.greenFg },
    }),
    customRule(counts, `=${letter("countsToward1000")}2=FALSE`, {
      backgroundColor: COLOR.grayBg,
      textFormat: { foregroundColor: COLOR.grayFg },
    }),
  );

  // --- Run # accent ----------------------------------------------------------
  rules.push(
    customRule(col("runNumber"), `=${letter("runNumber")}2<>""`, {
      textFormat: { foregroundColor: COLOR.accentBlue, bold: true },
    }),
  );

  // --- Final Time: subtle green -> white -> soft warm scale (fastest wins) ---
  rules.push({
    ranges: [col("finalTimeMs")],
    gradientRule: {
      // InterpolationPoint.value is a JSON *string* field: a numeric 50 is
      // rejected live with a TYPE_STRING error. PERCENTILE "50" pins the
      // midpoint to the column's median, so fast times stay green while slow
      // ones stay neutral warm (MIN/MAX carry no value by definition).
      minpoint: { color: COLOR.timeMin, type: "MIN" },
      midpoint: { color: COLOR.timeMid, type: "PERCENTILE", value: "50" },
      maxpoint: { color: COLOR.timeMax, type: "MAX" },
    },
  });

  // --- Deaths 1+ -------------------------------------------------------------
  rules.push(
    customRule(
      col("deaths"),
      `=AND(${letter("deaths")}2<>"",${letter("deaths")}2>0)`,
      { backgroundColor: COLOR.orangeBg, textFormat: { foregroundColor: COLOR.orangeFg, bold: true } },
    ),
  );

  // --- Completion label ------------------------------------------------------
  const completion = col("completion");
  rules.push(
    textEqRule(completion, "One-shot", {
      backgroundColor: COLOR.greenBg,
      textFormat: { foregroundColor: COLOR.greenFg, bold: true },
    }),
    textEqRule(completion, "Zero-cycle", {
      backgroundColor: COLOR.blueBg,
      textFormat: { foregroundColor: COLOR.blueFg, bold: true },
    }),
    textEqRule(completion, "One-cycle", {
      backgroundColor: COLOR.grayBg,
      textFormat: { foregroundColor: COLOR.grayFg },
    }),
    textEqRule(completion, "Invalid", {
      backgroundColor: COLOR.redBg,
      textFormat: { foregroundColor: COLOR.redFg, bold: true },
    }),
  );

  // --- Elo change: green gains, red losses -----------------------------------
  rules.push(
    customRule(col("eloChange"), `=${letter("eloChange")}2>0`, {
      textFormat: { foregroundColor: COLOR.greenFg, bold: true },
    }),
    customRule(col("eloChange"), `=${letter("eloChange")}2<0`, {
      textFormat: { foregroundColor: COLOR.redFg, bold: true },
    }),
  );

  // --- Data Status ------------------------------------------------------------
  const status = col("dataStatus");
  const statusKey = letter("dataStatus");
  rules.push(
    textEqRule(status, "COMPLETE", {
      backgroundColor: COLOR.greenBg,
      textFormat: { foregroundColor: COLOR.greenFg, bold: true },
    }),
    textEqRule(status, "NEEDS INPUT", {
      backgroundColor: COLOR.amberBg,
      textFormat: { foregroundColor: COLOR.amberFg, bold: true },
    }),
    customRule(
      status,
      `=AND(${statusKey}2<>"",${statusKey}2<>"COMPLETE",${statusKey}2<>"NEEDS INPUT")`,
      { backgroundColor: COLOR.redBg, textFormat: { foregroundColor: COLOR.redFg, bold: true } },
    ),
  );

  // --- Subtle alternating rows (lowest priority - semantic colours win) ------
  rules.push(
    customRule(
      {
        sheetId,
        startRowIndex: 1,
        endRowIndex: capacity,
        startColumnIndex: 0,
        endColumnIndex: COLUMN_COUNT,
      },
      "=ISODD(ROW())",
      { backgroundColor: COLOR.bandBg },
    ),
  );

  return rules;
};

export { conditionalFormatRules };

