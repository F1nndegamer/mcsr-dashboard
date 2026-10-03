import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MANUAL_FIELDS } from "../src/models/constants.js";
import {
  deserializeRow,
  headerRow,
  msToDuration,
  serializeRecord,
} from "../src/models/runRecord.js";
import {
  buildRecordSet,
  cellEquals,
  headerMatches,
  planRunsUpdates,
} from "../src/sheets/runSheet.js";

describe("Runs sheet schema", () => {
  it("implements the exact requested column order", () => {
    assert.deepEqual(headerRow(), [
      "Run #",
      "Match #",
      "Match ID",
      "Date",
      "Season",
      "Opponent",
      "Result",
      "Counts Toward 1000",
      "Seed",
      "Seed Type",
      "OW Split",
      "Nether Split",
      "Bastion Type",
      "Bastion Variant",
      "Bastion Time",
      "Blaze Rods",
      "End Split",
      "End Towers",
      "Completion Type",
      "Completion",
      "Final Time",
      "Deaths",
      "Death Messages",
      "Elo Before",
      "Elo Change",
      "Elo After",
      "Notes",
      "Data Status",
    ]);
  });

  it("stores durations as day fractions so Sheets can average and graph them", () => {
    assert.equal(msToDuration(86_400_000), 1);
    assert.equal(msToDuration(undefined), "");
  });

  it("round-trips a record through serialise/deserialise", () => {
    const record = {
      runNumber: 7,
      matchNumber: 12,
      matchId: 4242,
      dateMs: Date.UTC(2026, 9, 4, 12, 0, 0),
      season: 9,
      opponent: "Rival",
      result: "WIN",
      countsToward1000: true,
      seed: "mtf37jg2v018mtm4",
      seedType: "Village",
      owSplitMs: 60_000,
      netherSplitMs: 240_000,
      bastionType: "Treasure",
      bastionVariant: "Double Bad Gap",
      bastionTimeMs: 80_000,
      blazeRods: 7,
      endSplitMs: 100_000,
      endTowers: "79/88/91/103",
      completionType: 0,
      finalTimeMs: 600_000,
      deaths: 1,
      deathMessages: "lava",
      eloBefore: 1500,
      eloChange: 12,
      eloAfter: 1512,
      notes: "pb pace",
      dataStatus: "COMPLETE",
    };
    const roundTripped = deserializeRow(serializeRecord(record));
    assert.equal(roundTripped.runNumber, 7);
    assert.equal(roundTripped.matchId, 4242);
    assert.equal(roundTripped.opponent, "Rival");
    assert.equal(roundTripped.bastionVariant, "Double Bad Gap");
    assert.equal(roundTripped.completionType, 0);
    assert.equal(roundTripped.deaths, 1);
    assert.equal(roundTripped.notes, "pb pace");
    assert.equal(roundTripped.eloAfter, 1512);
  });

  it("headerMatches rejects a reordered or renamed header", () => {
    assert.equal(headerMatches(headerRow()), true);
    const renamed = headerRow().slice();
    renamed[0] = "Run Number";
    assert.equal(headerMatches(renamed), false);
  });
});

describe("manual field preservation", () => {
  const apiRecord = {
    matchId: 1,
    dateMs: 1_000,
    season: 9,
    opponent: "Rival",
    result: "WIN",
    countsToward1000: true,
    finalTimeMs: 600_000,
    // A fresh API record never carries manual values.
  };

  it("treats exactly the six documented fields as user-owned", () => {
    assert.deepEqual([...MANUAL_FIELDS].sort(), [
      "bastionVariant",
      "blazeRods",
      "completionType",
      "deathMessages",
      "deaths",
      "notes",
    ]);
  });

  it("keeps user values when an existing match is re-synced", () => {
    const sheetRecord = {
      matchId: 1,
      bastionVariant: "Triple Triple",
      blazeRods: 6,
      completionType: 1,
      deaths: 2,
      deathMessages: "fell",
      notes: "my note",
    };
    const merged = buildRecordSet({
      sheetRecords: [sheetRecord],
      normalizedById: new Map([[1, apiRecord]]),
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].bastionVariant, "Triple Triple");
    assert.equal(merged[0].blazeRods, 6);
    assert.equal(merged[0].completionType, 1);
    assert.equal(merged[0].deaths, 2);
    assert.equal(merged[0].deathMessages, "fell");
    assert.equal(merged[0].notes, "my note");
    assert.equal(merged[0].finalTimeMs, 600_000);
  });

  it("never overwrites notes or manual cells with blanks from the API", () => {
    const merged = buildRecordSet({
      sheetRecords: [{ matchId: 1, notes: "do not touch", deaths: 0 }],
      normalizedById: new Map([[1, { ...apiRecord }]]),
    });
    assert.equal(merged[0].notes, "do not touch");
    assert.equal(merged[0].deaths, 0);
  });
});

describe("planRunsUpdates", () => {
  it("plans no data updates when nothing changed", () => {
    const record = { matchId: 1, result: "LOSS", countsToward1000: false };
    const existing = [serializeRecord({ matchNumber: 1, ...record })];
    const plan = planRunsUpdates({
      records: [{ matchNumber: 1, ...record }],
      existingRows: existing,
    });
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.formulaRows.length, 1);
  });

  it("cellEquals tolerates float serials but not real changes", () => {
    const oneMsInDays = 1 / 86_400_000;
    assert.equal(cellEquals(0.006944444444, 0.006944444444 + oneMsInDays, "duration"), true);
    assert.equal(cellEquals(0.0069, 0.0079, "duration"), false);
    assert.equal(cellEquals("WIN", "WIN", "text"), true);
    assert.equal(cellEquals("WIN", "LOSS", "text"), false);
  });
});
