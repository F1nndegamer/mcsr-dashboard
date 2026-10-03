import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPLETION_FORMULA_TEMPLATE } from "../src/models/constants.js";
import { completionLabel, completionTypeOptions } from "../src/core/completionType.js";
import { completionFormulaForRow, parseCompletionType } from "../src/models/runRecord.js";

describe("completion type mapping (mirrors the Sheets formula)", () => {
  it("-1/0/1 map to their labels", () => {
    assert.equal(completionLabel(-1), "One-shot");
    assert.equal(completionLabel(0), "Zero-cycle");
    assert.equal(completionLabel(1), "One-cycle");
  });

  it("blank stays blank, anything else is Invalid", () => {
    for (const blank of [undefined, null, ""]) {
      assert.equal(completionLabel(blank), "");
    }
    for (const invalid of [2, -2, "fast", NaN]) {
      assert.equal(completionLabel(invalid), "Invalid");
    }
  });

  it("only -1, 0 and 1 are accepted options", () => {
    assert.deepEqual(completionTypeOptions(), [-1, 0, 1]);
    assert.equal(parseCompletionType("-1"), -1);
    assert.equal(parseCompletionType(0), 0);
    assert.equal(parseCompletionType("1"), 1);
    assert.equal(parseCompletionType("banana"), undefined);
    assert.equal(parseCompletionType(undefined), undefined);
  });

  it("the generated Sheets formula encodes the same mapping", () => {
    const formula = completionFormulaForRow(7);
    assert.ok(formula.startsWith("="));
    assert.ok(formula.includes("One-shot"));
    assert.ok(formula.includes("Zero-cycle"));
    assert.ok(formula.includes("One-cycle"));
    assert.ok(formula.includes("Invalid"));
    // The formula must point at the Completion Type cell of the same row.
    assert.equal(formula, COMPLETION_FORMULA_TEMPLATE("S", 7));
  });
});
