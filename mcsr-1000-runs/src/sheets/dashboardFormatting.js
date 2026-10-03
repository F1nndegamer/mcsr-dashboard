/**
 * Formatting requests for the Dashboard sheet.
 * Pure builder - no I/O - so it is cheap to unit test.
 */
export const dashboardFormatRequests = ({ sheetId, dashboard }) => [
  {
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
      cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
      fields: "userEnteredFormat.textFormat",
    },
  },
  {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: dashboard.headerRowIndex - 1,
        endRowIndex: dashboard.headerRowIndex,
        startColumnIndex: 0,
        endColumnIndex: 2,
      },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat.bold",
    },
  },
  ...dashboard.formatRows.map((entry) => ({
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
  })),
  {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: dashboard.chartFirstRow - 1,
        endRowIndex: dashboard.chartFirstRow - 1 + dashboard.chartRowCapacity,
        startColumnIndex: 1,
        endColumnIndex: 4,
      },
      cell: { userEnteredFormat: { numberFormat: { type: "TIME", pattern: "[h]:mm:ss.000" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  },
];
