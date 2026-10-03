import { COMPLETION_TYPES, DASHBOARD_SHEET, RUNS_SHEET } from "../models/constants.js";
import {
  COLUMN_COUNT,
  COLUMN_INDEX,
  COLUMN_LETTERS,
  RUNS_COLUMNS,
  headerRow,
} from "../models/runRecord.js";

export { RUNS_SHEET, DASHBOARD_SHEET, headerRow, RUNS_COLUMNS, COLUMN_LETTERS };
export const SHEET_TITLES = [RUNS_SHEET, DASHBOARD_SHEET];

const NUMBER_TYPES = {
  datetime: "DATE_TIME",
  duration: "TIME",
  int: "NUMBER",
  manualInt: "NUMBER",
  manualCompletion: "NUMBER",
};

/**
 * Builds every `batchUpdate` request needed to make the Runs sheet usable:
 * frozen header, filters, readable number formats and the Completion Type
 * dropdown. Applied once by `npm run init-sheet`.
 */
export const runsSheetSetupRequests = ({ sheetId, capacity = 2500, currentRowCount = 1000 } = {}) => {
  const requests = [];

  if (currentRowCount < capacity) {
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { rowCount: capacity, columnCount: Math.max(COLUMN_COUNT, 28) },
        },
        fields: "gridProperties.rowCount,gridProperties.columnCount",
      },
    });
  }

  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
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

  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: COLUMN_COUNT,
      },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          backgroundColor: { red: 0.13, green: 0.16, blue: 0.2 },
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
    },
  });

  RUNS_COLUMNS.forEach((column, index) => {
    const numberType = NUMBER_TYPES[column.type];
    if (!column.numberFormat || !numberType) return;
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: capacity,
          startColumnIndex: index,
          endColumnIndex: index + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: numberType, pattern: column.numberFormat },
            horizontalAlignment: "RIGHT",
          },
        },
        fields: "userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment",
      },
    });
  });

  // Counts Toward 1000 reads better centred.
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 1,
        endRowIndex: capacity,
        startColumnIndex: COLUMN_INDEX.countsToward1000,
        endColumnIndex: COLUMN_INDEX.countsToward1000 + 1,
      },
      cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
      fields: "userEnteredFormat.horizontalAlignment",
    },
  });

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

  return requests;
};

/** Column range (A1) for one column, excluding the header row. */
export const columnRange = (key, firstRow, lastRow) =>
  `${COLUMN_LETTERS[COLUMN_INDEX[key]]}${firstRow}:${COLUMN_LETTERS[COLUMN_INDEX[key]]}${lastRow}`;
