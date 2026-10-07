/**
 * Formatting requests for the Dashboard sheet.
 * Pure builder - no I/O - so it is cheap to unit test.
 *
 * Restrained palette shared with the Runs sheet: green = progress/success,
 * red = loss, amber = warning/draws, purple = special, slate = neutral.
 */

const SLATE = { red: 0.122, green: 0.165, blue: 0.216 };
const WHITE = { red: 1, green: 1, blue: 1 };
const GREEN = { red: 0.086, green: 0.42, blue: 0.2 };
const RED = { red: 0.6, green: 0.13, blue: 0.13 };
const AMBER = { red: 0.57, green: 0.36, blue: 0.02 };
const PURPLE = { red: 0.35, green: 0.29, blue: 0.55 };
const HERO_BG = { red: 0.918, green: 0.957, blue: 0.929 };

/** 1-based row of a labelled grid row, or null when the label is gone. */
const rowFor = (dashboard, label) => {
  const index = dashboard.grid.findIndex((row) => row[0] === label);
  return index === -1 ? null : index + 1;
};

const cellReq = (sheetId, row, column, format, fields) => ({
  repeatCell: {
    range: {
      sheetId,
      startRowIndex: row - 1,
      endRowIndex: row,
      startColumnIndex: column,
      endColumnIndex: column + 1,
    },
    cell: { userEnteredFormat: format },
    fields,
  },
});

const TEXT_FIELDS =
  "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor";

export const dashboardFormatRequests = ({ sheetId, dashboard }) => {
  const requests = [];
  const push = (request) => {
    if (request) requests.push(request);
  };

  const {
    headerRowIndex,
    progressRow,
    progressBarRow,
    chartFirstRow,
    chartRowCapacity,
    formatRows,
  } = dashboard;

  // --- title ---------------------------------------------------------------
  push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14, foregroundColor: SLATE } } },
      fields: "userEnteredFormat.textFormat",
    },
  });

  // --- meta labels (player / start date / last synced) ----------------------
  push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: SLATE } } },
      fields: TEXT_FIELDS,
    },
  });

  // --- hero: "X / 1000 Runs" + progress bar over a soft green block ---------
  if (progressRow) {
    push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: progressRow - 1,
          endRowIndex: progressBarRow ?? progressRow,
          startColumnIndex: 0,
          endColumnIndex: 2,
        },
        cell: { userEnteredFormat: { backgroundColor: HERO_BG } },
        fields: "userEnteredFormat.backgroundColor",
      },
    });
    push(cellReq(sheetId, progressRow, 0, { textFormat: { bold: true, foregroundColor: SLATE } }, TEXT_FIELDS));
    push(cellReq(sheetId, progressRow, 1, { textFormat: { bold: true, fontSize: 14, foregroundColor: GREEN } }, TEXT_FIELDS));
  }
  if (progressBarRow) {
    push(cellReq(sheetId, progressBarRow, 0, { textFormat: { bold: true, foregroundColor: SLATE } }, TEXT_FIELDS));
    push(
      cellReq(
        sheetId,
        progressBarRow,
        1,
        { textFormat: { bold: true, foregroundColor: GREEN, fontFamily: "monospace" } },
        `${TEXT_FIELDS},userEnteredFormat.textFormat.fontFamily`,
      ),
    );
  }

  // --- metric table header --------------------------------------------------
  push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: headerRowIndex - 1,
        endRowIndex: headerRowIndex,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, foregroundColor: WHITE },
          backgroundColor: SLATE,
          verticalAlignment: "MIDDLE",
        },
      },
      fields:
        "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.backgroundColor,userEnteredFormat.verticalAlignment",
    },
  });

  // --- number formats for percentage / duration stats ------------------------
  for (const entry of formatRows) {
    push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: entry.row - 1,
          endRowIndex: entry.row,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        cell: { userEnteredFormat: { numberFormat: { type: entry.type, pattern: entry.pattern } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }

  // --- restrained colour accents on the W/L/D/F stats + Progress % ----------
  for (const [label, color] of [
    ["Wins", GREEN],
    ["Losses", RED],
    ["Draws", AMBER],
    ["Forfeits", PURPLE],
  ]) {
    const row = rowFor(dashboard, label);
    if (row === null) continue;
    for (const column of [0, 1]) {
      push(cellReq(sheetId, row, column, { textFormat: { bold: true, foregroundColor: color } }, TEXT_FIELDS));
    }
  }
  const progressPctRow = rowFor(dashboard, "Progress %");
  if (progressPctRow !== null) {
    push(cellReq(sheetId, progressPctRow, 0, { textFormat: { bold: true, foregroundColor: SLATE } }, TEXT_FIELDS));
    push(cellReq(sheetId, progressPctRow, 1, { textFormat: { bold: true, foregroundColor: GREEN } }, TEXT_FIELDS));
  }

  // --- stream link segment (below the chart): purple = special -------------
  if (dashboard.streamHeaderRow && dashboard.streamValueRow) {
    push(
      cellReq(
        sheetId,
        dashboard.streamHeaderRow,
        0,
        { textFormat: { bold: true, foregroundColor: PURPLE } },
        TEXT_FIELDS,
      ),
    );
    for (const column of [1, 2, 3]) {
      push(
        cellReq(
          sheetId,
          dashboard.streamHeaderRow,
          column,
          { textFormat: { bold: true, foregroundColor: SLATE } },
          TEXT_FIELDS,
        ),
      );
      push(
        cellReq(
          sheetId,
          dashboard.streamValueRow,
          column,
          { textFormat: { underline: true, foregroundColor: PURPLE } },
          `${TEXT_FIELDS},userEnteredFormat.textFormat.underline`,
        ),
      );
    }
  }

  // --- chart helper columns: one consistent duration format ------------------
  push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: chartFirstRow - 1,
        endRowIndex: chartFirstRow - 1 + chartRowCapacity,
        startColumnIndex: 1,
        endColumnIndex: 4,
      },
      cell: { userEnteredFormat: { numberFormat: { type: "TIME", pattern: "[mm]:ss.000" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });

  // --- column widths ---------------------------------------------------------
  [240, 300, 150, 150].forEach((pixelSize, index) => {
    push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize },
        fields: "pixelSize",
      },
    });
  });

  return requests.filter(Boolean);
};
