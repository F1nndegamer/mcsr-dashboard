import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assignNumbers, highestRunNumber } from "../src/core/numbering.js";

const sequence = ["WIN", "LOSS", "FORFEIT", "DRAW", "WIN", "WIN"];

const makeRecords = (results) =>
  results.map((result, index) => ({
    matchId: 1000 + index,
    dateMs: Date.UTC(2026, 9, 3 + index),
    result,
    countsToward1000: result === "WIN",
  }));

describe("assignNumbers", () => {
  it("WIN/LOSS/FORFEIT/DRAW/WIN/WIN produces Run # 1,blank,blank,blank,2,3", () => {
    const ordered = assignNumbers(makeRecords(sequence));
    assert.deepEqual(
      ordered.map((record) => record.runNumber ?? null),
      [1, null, null, null, 2, 3],
    );
    assert.deepEqual(
      ordered.map((record) => record.matchNumber),
      [1, 2, 3, 4, 5, 6],
    );
  });

  it("orders chronologically regardless of input order", () => {
    const shuffled = makeRecords(sequence).reverse();
    const ordered = assignNumbers(shuffled);
    assert.deepEqual(
      ordered.map((record) => record.matchId),
      [1000, 1001, 1002, 1003, 1004, 1005],
    );
  });

  it("re-deriving after inserting an older WIN keeps numbering stable", () => {
    const first = assignNumbers(makeRecords(sequence));
    assert.equal(highestRunNumber(first), 3);
    const withOlder = assignNumbers([
      {
        matchId: 999,
        dateMs: Date.UTC(2026, 9, 1),
        result: "WIN",
        countsToward1000: true,
      },
      ...makeRecords(sequence),
    ]);
    assert.deepEqual(
      withOlder.map((record) => record.runNumber ?? null),
      [1, 2, null, null, null, 3, 4],
    );
  });

  it("no wins means no run numbers", () => {
    const ordered = assignNumbers(makeRecords(["LOSS", "DRAW", "FORFEIT"]));
    assert.ok(ordered.every((record) => record.runNumber === undefined));
    assert.equal(highestRunNumber(ordered), 0);
  });
});
