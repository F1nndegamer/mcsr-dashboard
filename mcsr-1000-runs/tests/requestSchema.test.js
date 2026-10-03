import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_UPDATE_REQUEST_TYPES,
  validateBatchUpdateRequests,
} from "../src/sheets/requestSchema.js";
import { runsSheetSetupRequests } from "../src/sheets/schema.js";
import { dashboardFormatRequests } from "../src/sheets/dashboardFormatting.js";
import { dashboardBuild } from "../src/sheets/dashboard.js";

/**
 * These tests encode the exact payloads the LIVE Google Sheets API rejected so
 * they can never be generated again:
 *
 *   Invalid JSON payload received.
 *   Unknown name "clearConditionalFormatRules" at 'requests[72]'.
 *   Invalid value at 'requests[80].add_conditional_format_rule.
 *   rule.gradient_rule.midpoint.value' (TYPE_STRING), 50
 */
describe("batchUpdate request validation", () => {
  it("accepts every request the Runs + Dashboard setup actually generates", () => {
    const runs = runsSheetSetupRequests({
      sheetId: 7,
      capacity: 2500,
      existingConditionalFormatRuleCount: 40,
    });
    const dash = dashboardFormatRequests({
      sheetId: 8,
      dashboard: dashboardBuild({ capacity: 2500 }),
    });
    validateBatchUpdateRequests(runs);
    validateBatchUpdateRequests(dash);
  });

  it("emits fontFamily only on textFormat, never directly on userEnteredFormat", () => {
    // The progress-bar cell must use the valid CellFormat -> TextFormat shape:
    // userEnteredFormat: { textFormat: { fontFamily: "..." } }.
    const dash = dashboardFormatRequests({
      sheetId: 8,
      dashboard: dashboardBuild({ capacity: 2500 }),
    });
    const serialised = JSON.stringify(dash);
    assert.ok(serialised.includes("monospace"), "progress-bar monospace styling must survive");
    for (const request of dash) {
      for (const key of ["repeatCell", "updateCells", "appendCells"]) {
        const payload = request[key];
        if (!payload) continue;
        const formats = [];
        if (payload.cell?.userEnteredFormat) formats.push(payload.cell.userEnteredFormat);
        for (const row of payload.rows ?? []) {
          for (const cell of row.values ?? []) {
            if (cell?.userEnteredFormat) formats.push(cell.userEnteredFormat);
          }
        }
        for (const format of formats) {
          assert.equal(
            "fontFamily" in format,
            false,
            `fontFamily must live on textFormat, found directly on userEnteredFormat in ${key}`,
          );
        }
      }
      if (request.addConditionalFormatRule?.rule?.booleanRule?.format) {
        assert.equal(
          "fontFamily" in request.addConditionalFormatRule.rule.booleanRule.format,
          false,
          "fontFamily must live on textFormat, found directly on booleanRule.format",
        );
      }
    }
    const mono = dash.find((request) =>
      JSON.stringify(request).includes("monospace"),
    );
    assert.ok(mono, "expected a monospace progress-bar request");
    assert.ok(
      JSON.stringify(mono).includes("textFormat"),
      "monospace styling must be nested under textFormat",
    );
  });

  it("never emits a request type outside the official API schema", () => {
    const all = [
      ...runsSheetSetupRequests({ sheetId: 7, capacity: 2500, existingConditionalFormatRuleCount: 5 }),
      ...runsSheetSetupRequests({ sheetId: 7, capacity: 2500 }),
      ...dashboardFormatRequests({ sheetId: 8, dashboard: dashboardBuild({ capacity: 2500 }) }),
    ];
    for (const request of all) {
      const [type] = Object.keys(request);
      assert.ok(
        BATCH_UPDATE_REQUEST_TYPES.includes(type),
        `invalid batchUpdate request type "${type}"`,
      );
      assert.notEqual(type, "clearConditionalFormatRules");
    }
  });

  it("rejects the invented clearConditionalFormatRules request type", () => {
    assert.throws(
      () => validateBatchUpdateRequests([{ clearConditionalFormatRules: { range: { sheetId: 7 } } }]),
      /unknown request type "clearConditionalFormatRules"/,
    );
  });

  it("rejects a numeric gradient midpoint value (live TYPE_STRING error)", () => {
    assert.throws(
      () =>
        validateBatchUpdateRequests([
          {
            addConditionalFormatRule: {
              index: 0,
              rule: {
                ranges: [{ sheetId: 7, startRowIndex: 1, endRowIndex: 2500 }],
                gradientRule: {
                  minpoint: { color: { red: 0.8, green: 0.9, blue: 0.8 }, type: "MIN" },
                  midpoint: { color: { red: 1, green: 1, blue: 1 }, type: "PERCENTILE", value: 50 },
                  maxpoint: { color: { red: 0.9, green: 0.9, blue: 0.9 }, type: "MAX" },
                },
              },
            },
          },
        ]),
      /midpoint\.value must be a string \(received number 50\)/,
    );
  });

  it("accepts the corrected string midpoint and rejects MIN/MAX with values", () => {
    const point = (type, value) => ({
      ranges: [{ sheetId: 7 }],
      gradientRule: {
        minpoint: { type: "MIN" },
        midpoint: { type, ...(value === undefined ? {} : { value }) },
        maxpoint: { type: "MAX" },
      },
    });
    validateBatchUpdateRequests([
      { addConditionalFormatRule: { index: 0, rule: point("PERCENTILE", "50") } },
    ]);
    assert.throws(
      () => validateBatchUpdateRequests([{ addConditionalFormatRule: { index: 0, rule: point("PERCENTILE", "not-a-number") } }]),
      /midpoint\.value must be a numeric string or a formula/,
    );
    assert.throws(
      () => validateBatchUpdateRequests([{ addConditionalFormatRule: { index: 0, rule: point("PERCENTILE") } }]),
      /midpoint\.value is required/,
    );
    assert.throws(
      () =>
        validateBatchUpdateRequests([
          {
            addConditionalFormatRule: {
              index: 0,
              rule: {
                ranges: [{ sheetId: 7 }],
                gradientRule: {
                  minpoint: { type: "MIN", value: "0" },
                  midpoint: { type: "PERCENTILE", value: "50" },
                  maxpoint: { type: "MAX" },
                },
              },
            },
          },
        ]),
      /minpoint\.value must be omitted when type is MIN/,
    );
  });

  it("rejects unknown and multi-type request objects", () => {
    assert.throws(
      () => validateBatchUpdateRequests([{ clearBasicFilterTypo: {} }]),
      /unknown request type/,
    );
    assert.throws(
      () => validateBatchUpdateRequests([{ addSheet: { properties: { title: "x" } }, deleteSheet: { sheetId: 1 } }]),
      /exactly one request type/,
    );
  });

  it("rejects fontFamily placed directly on userEnteredFormat (live API: Unknown name \"fontFamily\")", () => {
    // Regression for the live rejection:
    //   Unknown name "fontFamily" at 'requests[6].repeat_cell.cell.user_entered_format'.
    // CellFormat has no fontFamily field - the font lives on TextFormat, i.e.
    // userEnteredFormat: { textFormat: { fontFamily: "..." } }.
    assert.throws(
      () =>
        validateBatchUpdateRequests([
          {
            repeatCell: {
              range: { sheetId: 8, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  fontFamily: "monospace",
                },
              },
              fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.fontFamily",
            },
          },
        ]),
      /fontFamily must live on textFormat/,
    );
    // The corrected shape passes.
    validateBatchUpdateRequests([
      {
        repeatCell: {
          range: { sheetId: 8, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 1, endColumnIndex: 2 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, fontFamily: "monospace" },
            },
          },
          fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.fontFamily",
        },
      },
    ]);
  });

  it("rejects invalid conditional-format delete indexes", () => {
    assert.throws(
      () => validateBatchUpdateRequests([{ deleteConditionalFormatRule: { index: -1, sheetId: 7 } }]),
      /deleteConditionalFormatRule\.index must be a non-negative integer/,
    );
    assert.throws(
      () => validateBatchUpdateRequests([{ deleteConditionalFormatRule: { index: 1.5, sheetId: 7 } }]),
      /deleteConditionalFormatRule\.index must be a non-negative integer/,
    );
    validateBatchUpdateRequests([{ deleteConditionalFormatRule: { index: 0, sheetId: 7 } }]);
  });
});
