import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MANUAL_FIELDS } from "../src/models/constants.js";
import {
  COLUMN_COUNT,
  COLUMN_INDEX,
  COLUMN_LETTERS,
  RUNS_SECTIONS,
  deserializeRow,
  headerRow,
  msToDuration,
  serializeRecord,
} from "../src/models/runRecord.js";
import { COLOR, conditionalFormatRules, runsSheetSetupRequests } from "../src/sheets/schema.js";
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
      "Bastion Time",
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

  it("drops Bastion Variant and Blaze Rods entirely", () => {
    assert.equal(headerRow().includes("Bastion Variant"), false);
    assert.equal(headerRow().includes("Blaze Rods"), false);
    assert.equal(COLUMN_COUNT, 26);
    assert.equal("bastionVariant" in COLUMN_INDEX, false);
    assert.equal("blazeRods" in COLUMN_INDEX, false);
    // Bastion Type / Bastion Time stay; Final Time and Data Status shifted.
    assert.equal(COLUMN_LETTERS[COLUMN_INDEX.finalTimeMs], "S");
    assert.equal(COLUMN_LETTERS[COLUMN_INDEX.dataStatus], "Z");
    assert.equal(COLUMN_LETTERS[COLUMN_INDEX.completionType], "Q");
  });

  it("groups columns into the documented sections without gaps", () => {
    assert.deepEqual(
      RUNS_SECTIONS.map((section) => section.label),
      ["IDENTIFICATION", "RESULT", "OVERWORLD", "NETHER", "END", "FINAL", "RANKED", "USER"],
    );
    let expected = 0;
    for (const section of RUNS_SECTIONS) {
      assert.equal(section.startIndex, expected);
      assert.ok(section.endIndex >= section.startIndex);
      expected = section.endIndex + 1;
    }
    assert.equal(expected, COLUMN_COUNT);
    assert.equal(RUNS_SECTIONS[0].startIndex, COLUMN_INDEX.runNumber);
    assert.equal(RUNS_SECTIONS.find((s) => s.key === "final").startIndex, COLUMN_INDEX.finalTimeMs);
    assert.equal(RUNS_SECTIONS.find((s) => s.key === "user").startIndex, COLUMN_INDEX.notes);
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
      bastionTimeMs: 80_000,
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
    assert.equal(roundTripped.bastionType, "Treasure");
    assert.equal(roundTripped.bastionTimeMs, 80_000);
    assert.equal(roundTripped.completionType, 0);
    assert.equal(roundTripped.deaths, 1);
    assert.equal(roundTripped.notes, "pb pace");
    assert.equal(roundTripped.eloAfter, 1512);
    assert.equal(roundTripped.bastionVariant, undefined);
    assert.equal(roundTripped.blazeRods, undefined);
  });

  it("headerMatches rejects a reordered or renamed header", () => {
    assert.equal(headerMatches(headerRow()), true);
    const renamed = headerRow().slice();
    renamed[0] = "Run Number";
    assert.equal(headerMatches(renamed), false);
  });
});

describe("display defaults for absent values", () => {
  const cell = (record, key) => serializeRecord(record)[COLUMN_INDEX[key]];

  it("shows N/A for a split the run never reached", () => {
    // A LOSS reaches the Nether but never the End, so those two splits have no
    // value at all - "not applicable", distinct from "not measured yet".
    const record = { matchId: 1, owSplitMs: 60_000, endSplitMs: undefined, finalTimeMs: undefined };
    assert.equal(cell(record, "endSplitMs"), "N/A");
    assert.equal(cell(record, "finalTimeMs"), "N/A");
    // A real split is still written as a day fraction so Sheets can aggregate it.
    assert.equal(cell(record, "owSplitMs"), 60_000 / 86_400_000);
  });

  it("N/A round-trips back to undefined, so re-syncing is stable", () => {
    const first = serializeRecord({ matchId: 1, endSplitMs: undefined });
    const record = deserializeRow(first);
    assert.equal(record.endSplitMs, undefined, "N/A must not be read back as a duration");
    // ...and serialising again produces the identical cell, so no rewrite loop.
    assert.equal(serializeRecord(record)[COLUMN_INDEX.endSplitMs], "N/A");
  });

  it("shows N/A in Death Messages for a deathless run, but keeps real messages", () => {
    assert.equal(cell({ matchId: 1, deaths: 0, deathMessages: "" }, "deathMessages"), "N/A");
    assert.equal(cell({ matchId: 2, deaths: 0, deathMessages: "close call" }, "deathMessages"), "close call");
    assert.equal(cell({ matchId: 3, deaths: 2, deathMessages: "lava" }, "deathMessages"), "lava");
    // Deaths is always displayed as a number now, so an unknown count shows 0
    // and its (necessarily empty) message column shows N/A rather than a blank
    // cell that would look like an oversight next to a filled-in 0.
    assert.equal(cell({ matchId: 4, deaths: undefined }, "deaths"), 0);
    assert.equal(cell({ matchId: 4, deaths: undefined, deathMessages: "" }, "deathMessages"), "N/A");
  });

  it("fills Deaths with 0 whenever no real count was found", () => {
    assert.equal(cell({ matchId: 1, deaths: 0 }, "deaths"), 0);
    assert.equal(cell({ matchId: 2, deaths: undefined }, "deaths"), 0);
    // A real count is always preserved verbatim.
    assert.equal(cell({ matchId: 3, deaths: 4 }, "deaths"), 4);
  });

  it("shows N/A for a missing Elo Before/After but 0 for a missing Elo change", () => {
    // Ratings are not deltas: 0 would be a real (terrible) rating, so the
    // placeholder has to say "not reported".
    assert.equal(cell({ matchId: 1, eloBefore: undefined }, "eloBefore"), "N/A");
    assert.equal(cell({ matchId: 1, eloAfter: undefined }, "eloAfter"), "N/A");
    assert.equal(cell({ matchId: 2, eloBefore: 1500, eloAfter: 1512 }, "eloBefore"), 1500);
    assert.equal(cell({ matchId: 2, eloBefore: 1500, eloAfter: 1512 }, "eloAfter"), 1512);

    // A change genuinely can be zero, so zero is the right default there.
    assert.equal(cell({ matchId: 3, eloChange: undefined }, "eloChange"), 0);
    assert.equal(cell({ matchId: 3, eloChange: 0 }, "eloChange"), 0);
    assert.equal(cell({ matchId: 3, eloChange: -14 }, "eloChange"), -14);
  });

  it("round-trips the Elo N/A placeholder back to an absent value", () => {
    const record = deserializeRow(serializeRecord({ matchId: 1, eloBefore: undefined }));
    assert.equal(record.eloBefore, undefined, "N/A must not become a number on read");
    assert.equal(serializeRecord(record)[COLUMN_INDEX.eloBefore], "N/A");
  });

  it("always writes Counts Toward 1000 as an explicit boolean", () => {
    assert.equal(cell({ matchId: 1, countsToward1000: true }, "countsToward1000"), true);
    assert.equal(cell({ matchId: 2, countsToward1000: false }, "countsToward1000"), false);
    // Previously an unknown flag serialised to "", which read as "no data".
    assert.equal(cell({ matchId: 3, countsToward1000: undefined }, "countsToward1000"), false);
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

  it("treats exactly the four documented fields as user-owned", () => {
    assert.deepEqual([...MANUAL_FIELDS].sort(), [
      "completionType",
      "deathMessages",
      "deaths",
      "notes",
    ]);
  });

  it("keeps user values when an existing match is re-synced", () => {
    const sheetRecord = {
      matchId: 1,
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

  it("backfills explicit FALSE and 0 over blank cells, but never clears a value", () => {
    // The bug these guard against: blank was treated as equal to false/0, so a
    // sheet written before the defaults existed stayed blank forever.
    assert.equal(cellEquals(false, "", "bool"), false, "FALSE must overwrite a blank cell");
    assert.equal(cellEquals(false, undefined, "bool"), false);
    assert.equal(cellEquals(0, "", "int"), false, "0 must overwrite a blank cell");
    assert.equal(cellEquals(0, "", "apiSeededInt"), false);

    // Already-correct values stay untouched, so sync is still idempotent.
    assert.equal(cellEquals(false, false, "bool"), true);
    assert.equal(cellEquals(0, 0, "int"), true);

    // The reverse direction must remain "equal": a blank desired value never
    // wipes a stored 0/FALSE, which protects the manual fields.
    assert.equal(cellEquals("", false, "bool"), true);
    assert.equal(cellEquals("", 0, "manualInt"), true);
    assert.equal(cellEquals("", 0, "apiSeededInt"), true);
  });

  it("plans a backfill write for a row whose defaults are not in the sheet yet", () => {
    const record = { matchNumber: 1, matchId: 1, result: "LOSS", countsToward1000: false, deaths: 0, eloChange: 0 };
    const desired = serializeRecord(record);
    // Simulate a legacy row: the defaults are simply missing.
    const legacy = desired.slice();
    legacy[COLUMN_INDEX.countsToward1000] = "";
    legacy[COLUMN_INDEX.deaths] = "";
    legacy[COLUMN_INDEX.eloChange] = "";

    const plan = planRunsUpdates({ records: [record], existingRows: [legacy] });
    assert.ok(plan.updates.length > 0, "expected sync to write the missing defaults");

    // And once written, a second pass must plan nothing.
    const again = planRunsUpdates({ records: [record], existingRows: [desired] });
    assert.deepEqual(again.updates, []);
  });

  it("does not let an explicit undefined from the API erase a stored Elo value", () => {
    // `{...existing, ...api}` copies an own `key: undefined` over the stored value.
    // extractElo returns exactly that when only one of before/change is present.
    const merged = buildRecordSet({
      sheetRecords: [{ matchId: 1, eloBefore: 1500, eloAfter: 1505 }],
      normalizedById: new Map([[1, { matchId: 1, eloBefore: 1500, eloChange: 5, eloAfter: undefined }]]),
    });
    assert.equal(merged[0].eloAfter, 1505, "a stored Elo After must survive an undefined API value");
    assert.equal(merged[0].eloChange, 5);
  });
});

describe("Runs sheet presentation", () => {
  const requests = runsSheetSetupRequests({ sheetId: 7, capacity: 2500 });

  it("freezes the header row and the two id columns", () => {
    const frozen = requests.find(
      (request) => request.updateSheetProperties?.properties?.gridProperties?.frozenRowCount,
    );
    assert.ok(frozen, "no freeze request emitted");
    assert.equal(frozen.updateSheetProperties.properties.gridProperties.frozenColumnCount, 2);
  });

  it("styles one header block per section and draws separator borders", () => {
    const headerBlocks = requests.filter(
      (request) =>
        request.repeatCell &&
        request.repeatCell.range.startRowIndex === 0 &&
        request.repeatCell.range.endRowIndex === 1,
    );
    assert.equal(headerBlocks.length, RUNS_SECTIONS.length);
    const separators = requests.filter((request) => request.updateBorders?.left);
    // Every section but the first gets a left separator - no spacer columns.
    assert.equal(separators.length, RUNS_SECTIONS.length - 1);
    assert.ok(requests.some((request) => request.updateBorders?.bottom));
  });

  it("sets a pixel width for every column", () => {
    const widths = requests.filter((request) => request.updateDimensionProperties);
    assert.equal(widths.length, COLUMN_COUNT);
    for (const request of widths) {
      assert.ok(request.updateDimensionProperties.properties.pixelSize >= 50);
    }
  });

  it("deletes every existing conditional rule before re-adding them (idempotent init)", () => {
    // Clean sheet: no delete requests, and never the invented
    // `clearConditionalFormatRules` type (the live API rejects it).
    const clean = runsSheetSetupRequests({ sheetId: 7, capacity: 2500, existingConditionalFormatRuleCount: 0 });
    assert.equal(clean.some((request) => request.deleteConditionalFormatRule), false);
    assert.equal(clean.some((request) => request.clearConditionalFormatRules), false);

    // Pre-existing rules are deleted highest-index-first, all before the first
    // re-add, so rule indexes stay valid however the API resolves them.
    const dirty = runsSheetSetupRequests({ sheetId: 7, capacity: 2500, existingConditionalFormatRuleCount: 3 });
    const deletes = dirty.filter((request) => request.deleteConditionalFormatRule);
    assert.deepEqual(deletes.map((request) => request.deleteConditionalFormatRule.index), [2, 1, 0]);
    for (const request of deletes) {
      assert.equal(request.deleteConditionalFormatRule.sheetId, 7);
    }
    const lastDelete = dirty.map((request) => Boolean(request.deleteConditionalFormatRule)).lastIndexOf(true);
    const firstAdd = dirty.findIndex((request) => request.addConditionalFormatRule);
    assert.ok(lastDelete !== -1 && firstAdd !== -1 && lastDelete < firstAdd);
    const addIndexes = dirty
      .filter((request) => request.addConditionalFormatRule)
      .map((request) => request.addConditionalFormatRule.index);
    assert.deepEqual(addIndexes, addIndexes.map((_, index) => index));
  });

  it("clears stale data validation everywhere before applying the Completion Type dropdown", () => {
    // Regression: when `Bastion Variant` / `Blaze Rods` were dropped, Completion
    // Type moved from column index 18 to 16. The dropdown written against the old
    // layout stayed anchored to index 18 - now `Final Time` - so the duration
    // column offered a -1/0/1 dropdown and rejected every real time.
    const requests = runsSheetSetupRequests({ sheetId: 7, capacity: 2500 });
    const validations = requests.filter((request) => request.setDataValidation);
    assert.ok(validations.length >= 2, "expected a clearing request plus the dropdown");

    const [clearing, dropdown] = validations;
    const clear = clearing.setDataValidation;
    // Covers the entire body, so ANY leftover rule is overwritten.
    assert.equal(clear.range.startColumnIndex, 0);
    assert.equal(clear.range.endColumnIndex, COLUMN_COUNT);
    assert.equal(clear.range.startRowIndex, 1);
    // Non-strict + non-UI so no cell is ever flagged as invalid data.
    assert.equal(clear.rule.strict, false);
    assert.equal(clear.rule.showCustomUi, false);

    // The real dropdown then lands on Completion Type only.
    const real = dropdown.setDataValidation;
    assert.equal(real.range.startColumnIndex, COLUMN_INDEX.completionType);
    assert.equal(real.range.endColumnIndex, COLUMN_INDEX.completionType + 1);
    assert.equal(real.rule.condition.type, "ONE_OF_LIST");

    // The clearing request must come first, otherwise stale rules survive.
    assert.ok(requests.indexOf(clearing) < requests.indexOf(dropdown));

    // Guard the actual bug: Final Time must never be a dropdown column.
    assert.notEqual(COLUMN_INDEX.finalTimeMs, COLUMN_INDEX.completionType);
    for (const request of validations) {
      const { startColumnIndex, endColumnIndex } = request.setDataValidation.range;
      const isDropdown = request.setDataValidation.rule.condition.type === "ONE_OF_LIST";
      if (!isDropdown) continue;
      assert.ok(
        !(startColumnIndex <= COLUMN_INDEX.finalTimeMs && COLUMN_INDEX.finalTimeMs < endColumnIndex),
        "Final Time must not carry the -1/0/1 dropdown",
      );
    }
  });

  it("tints N/A, a deathless zero and a zero Elo change with distinct, quiet colours", () => {
    const rules = conditionalFormatRules({ sheetId: 7, capacity: 2500 });
    const formulas = rules
      .map((rule) => rule.booleanRule?.condition?.values?.[0]?.userEnteredValue)
      .filter((value) => typeof value === "string");

    // Unreached splits (and their N/A placeholder) are greyed + italicised.
    assert.ok(
      formulas.some((f) => f.includes("ISNUMBER") && f.includes("=FALSE")),
      "expected a rule that mutes non-numeric (N/A) split cells",
    );
    assert.ok(formulas.some((f) => f.includes("COUNTIF")), "expected the best-time emphasis rule");

    // A FALSE flag is never red: a run that does not count is normal, not a loss.
    const countsRules = rules.filter((rule) => {
      const f = rule.booleanRule?.condition?.values?.[0]?.userEnteredValue;
      return typeof f === "string" && f.includes(`${COLUMN_LETTERS[COLUMN_INDEX.countsToward1000]}2=FALSE`);
    });
    assert.equal(countsRules.length, 1, "expected exactly one FALSE rule");
    const falseFormat = countsRules[0].booleanRule.format;
    assert.equal(falseFormat.backgroundColor, undefined, "FALSE must not be filled");
    assert.notDeepEqual(falseFormat.textFormat?.foregroundColor, COLOR.redFg, "FALSE must not be red");

    // A zero Elo change is blue *text*, not a blue-filled cell: a fill would read
    // as a highlight rather than "nothing happened".
    const eloZero = rules.find((rule) => {
      const f = rule.booleanRule?.condition?.values?.[0]?.userEnteredValue;
      return f === `=${COLUMN_LETTERS[COLUMN_INDEX.eloChange]}2=0`;
    });
    assert.ok(eloZero, "expected an Elo Change = 0 rule");
    assert.equal(eloZero.booleanRule.format.backgroundColor, undefined, "Elo 0 must not be filled");
    assert.deepEqual(eloZero.booleanRule.format.textFormat.foregroundColor, COLOR.blueFg);

    // A DRAW is blue even when the API reports a non-zero change, so its rule
    // must be registered BEFORE the gain/loss rules.
    const drawIndex = formulas.indexOf(`=$${COLUMN_LETTERS[COLUMN_INDEX.result]}2="DRAW"`);
    const gainIndex = formulas.indexOf(`=${COLUMN_LETTERS[COLUMN_INDEX.eloChange]}2>0`);
    const lossIndex = formulas.indexOf(`=${COLUMN_LETTERS[COLUMN_INDEX.eloChange]}2<0`);
    assert.ok(drawIndex !== -1, "expected a DRAW rule on Elo Change");
    assert.ok(drawIndex < gainIndex && drawIndex < lossIndex, "DRAW must outrank gain/loss");
    // `formulas` is filtered, so its indices do not line up with `rules`.
    const drawRule = rules.find(
      (rule) => rule.booleanRule?.condition?.values?.[0]?.userEnteredValue === `=$${COLUMN_LETTERS[COLUMN_INDEX.result]}2="DRAW"`,
    );
    assert.deepEqual(drawRule.booleanRule.format.textFormat.foregroundColor, COLOR.blueFg);
    assert.equal(drawRule.booleanRule.format.backgroundColor, undefined);

    // Elo Before/After N/A placeholders are muted like the other N/A cells.
    for (const key of ["eloBefore", "eloAfter"]) {
      const nA = rules.find((rule) => {
        const f = rule.booleanRule?.condition?.values?.[0]?.userEnteredValue;
        return f === "N/A" && rule.booleanRule.condition.type === "TEXT_EQ" && rule.ranges?.[0]?.startColumnIndex === COLUMN_INDEX[key];
      });
      assert.ok(nA, `expected an N/A rule on ${key}`);
      assert.equal(nA.booleanRule.format.textFormat.italic, true);
    }

    // Deathless zero, zero Elo change and a FALSE flag all read quietly.
    assert.ok(formulas.some((f) => /^=\w+2=0$/.test(f)), "expected a Deaths=0 rule");
    assert.ok(
      formulas.filter((f) => /^=\w+2=0$/.test(f)).length >= 2,
      "expected both Deaths=0 and EloChange=0 rules",
    );

    // The N/A placeholder is styled (italic) rather than left to the number
    // format, so it never looks like a corrupt value.
    const italicRules = rules.filter((rule) => rule.booleanRule?.format?.textFormat?.italic);
    assert.ok(italicRules.length >= 2, "N/A splits and N/A death messages should be italic");

    // The best-time rule must exclude N/A rows, or a placeholder would win.
    const bestTime = rules.find(
      (rule) => rule.booleanRule?.condition?.values?.[0]?.userEnteredValue?.includes("COUNTIF"),
    );
    assert.ok(
      bestTime.booleanRule.condition.values[0].userEnteredValue.includes("ISNUMBER"),
      "the best-time rule must ignore N/A rows",
    );
  });

  it("covers every semantic colour rule, banding last", () => {
    const rules = conditionalFormatRules({ sheetId: 7, capacity: 2500 });
    const texts = rules
      .map((rule) => rule.booleanRule?.condition?.values?.[0]?.userEnteredValue)
      .filter((value) => typeof value === "string");
    for (const value of ["WIN", "LOSS", "DRAW", "FORFEIT", "COMPLETE", "NEEDS INPUT", "One-shot", "Invalid"]) {
      assert.ok(texts.includes(value), `missing rule for ${value}`);
    }
    // Final Time uses a gradient (not a rainbow): one gradient rule only.
    const gradients = rules.filter((rule) => rule.gradientRule);
    assert.equal(gradients.length, 1);
    const gradient = gradients[0].gradientRule;
    // MIN/MAX anchor the extremes without a value; the midpoint is a STRING
    // percentile (the live API rejects numeric values: TYPE_STRING error) and
    // follows the data median, so fastest times stay green and slow ones stay
    // neutral warm.
    assert.equal(gradient.minpoint.type, "MIN");
    assert.equal("value" in gradient.minpoint, false);
    assert.equal(gradient.midpoint.type, "PERCENTILE");
    assert.equal(gradient.midpoint.value, "50");
    assert.equal(typeof gradient.midpoint.value, "string");
    assert.equal(gradient.maxpoint.type, "MAX");
    assert.equal("value" in gradient.maxpoint, false);
    // Restrained green -> white -> soft warm palette, never a rainbow.
    assert.deepEqual(gradient.minpoint.color, { red: 0.847, green: 0.937, blue: 0.855 });
    assert.deepEqual(gradient.midpoint.color, { red: 1, green: 1, blue: 1 });
    assert.deepEqual(gradient.maxpoint.color, { red: 0.988, green: 0.914, blue: 0.882 });
    // The alternating-row tint must be the lowest-priority rule so semantic
    // colours always win.
    const last = rules[rules.length - 1];
    assert.equal(last.booleanRule.condition.values[0].userEnteredValue, "=ISODD(ROW())");
    // Deaths 1+ is flagged subtly via a custom formula.
    assert.ok(texts.some((value) => String(value).includes('>0')));
  });
});
