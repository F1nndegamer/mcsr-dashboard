import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeDataStatus, evaluateDataStatus } from "../src/core/dataStatus.js";

const win = (overrides = {}) => ({ result: "WIN", ...overrides });

describe("evaluateDataStatus", () => {
  it("a fully filled WIN is COMPLETE", () => {
    const out = evaluateDataStatus(
      win({
        bastionVariant: "Double Bad Gap",
        completionType: 0,
        deaths: 0,
      }),
    );
    assert.equal(out.status, "COMPLETE");
    assert.deepEqual(out.missing, []);
  });

  it("a WIN missing any required manual field is NEEDS INPUT", () => {
    const out = evaluateDataStatus(win({}));
    assert.equal(out.status, "NEEDS INPUT");
    assert.ok(out.missing.includes("Bastion Variant"));
    assert.ok(out.missing.includes("Completion Type"));
    assert.ok(out.missing.includes("Deaths"));
  });

  it("Death Messages are only required when Deaths > 0", () => {
    assert.equal(computeDataStatus(win({ bastionVariant: "x", completionType: 1, deaths: 0 })), "COMPLETE");
    const missing = evaluateDataStatus(
      win({ bastionVariant: "x", completionType: 1, deaths: 2, deathMessages: "" }),
    );
    assert.equal(missing.status, "NEEDS INPUT");
    assert.ok(missing.missing.includes("Death Messages"));
    const filled = evaluateDataStatus(
      win({ bastionVariant: "x", completionType: 1, deaths: 2, deathMessages: "burnt in lava" }),
    );
    assert.equal(filled.status, "COMPLETE");
  });

  it("Blaze Rods never affect the status", () => {
    assert.equal(
      computeDataStatus(win({ bastionVariant: "x", completionType: -1, deaths: 0, blazeRods: undefined })),
      "COMPLETE",
    );
  });

  it("losses, draws and forfeits never demand completion data", () => {
    for (const result of ["LOSS", "DRAW", "FORFEIT"]) {
      assert.equal(computeDataStatus({ result }), "COMPLETE");
    }
  });
});
