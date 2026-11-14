import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "../src/sheets/backend.js";
import { COLUMN_COUNT, COLUMN_INDEX } from "../src/models/runRecord.js";
import { createBackend, ensureSheets, initializeSheets } from "../src/sheets/index.js";
import { readRunsSheet } from "../src/sheets/runSheet.js";
import { runsSheetCellFormatRequests } from "../src/sheets/schema.js";

const config = (overrides = {}) => ({
  player: "AwenRuns",
  startDateIso: "2026-10-03",
  backend: "memory",
  spreadsheetTitle: "test",
  sheetRowCapacity: 2500,
  ...overrides,
});

describe("sheet setup + duplicate-safe reads", () => {
  it("initializeSheets creates Runs + Dashboard and install the schema header", async () => {
    const backend = new MemoryBackend();
    const { headerWritten } = await initializeSheets({ backend, config: config() });
    assert.equal(headerWritten, true);
    assert.deepEqual((await backend.getSheetTitles()).sort(), ["Dashboard", "Runs"]);
    const { records, dataRows } = await readRunsSheet({ backend });
    assert.deepEqual(records, []);
    assert.deepEqual(dataRows, []);
    // Second run is idempotent: the header is left alone.
    const again = await initializeSheets({ backend, config: config() });
    assert.equal(again.headerWritten, false);
  });

  it("createBackend + ensureSheets never clobber an existing header", async () => {
    const { backend } = await createBackend({ config: config() });
    await ensureSheets({ backend, config: config() });
    const header = await backend.readValues("Runs!A1:Z1");
    assert.equal(header[0][0], "Run #");
    assert.equal(header[0][25], "Data Status");
  });

  it("ensureSheets applies per-column number formats to the Runs body", async () => {
    const { backend } = await createBackend({ config: config() });
    await ensureSheets({ backend, config: config() });
    const formatRequests = backend.sheetRequests.filter((request) => request.repeatCell);
    assert.ok(formatRequests.length > 0, "expected repeatCell format requests");
    const owSplit = formatRequests.find(
      (request) => request.repeatCell.range.startColumnIndex === COLUMN_INDEX.owSplitMs
    );
    assert.ok(owSplit, "expected a format request for the OW Split column");
    assert.deepEqual(owSplit.repeatCell.cell.userEnteredFormat.numberFormat, {
      type: "TIME",
      pattern: "[mm]:ss.000",
    });
    const dateCol = formatRequests.find(
      (request) => request.repeatCell.range.startColumnIndex === COLUMN_INDEX.dateMs
    );
    assert.deepEqual(dateCol.repeatCell.cell.userEnteredFormat.numberFormat, {
      type: "DATE_TIME",
      pattern: "yyyy-mm-dd hh:mm",
    });
  });

  it("readRunsSheet skips blank rows and rows without a Match ID", async () => {
    const backend = new MemoryBackend();
    await initializeSheets({ backend, config: config() });
    await backend.batchUpdateValues({
      updates: [
        // A row with no Match ID must not become a record.
        { range: "Runs!A2:Z2", values: [["", "", "", "", "", "Nobody", "LOSS"]] },
      ],
    });
    const { records } = await readRunsSheet({ backend });
    assert.deepEqual(records, []);
  });

  it("re-running initializeSheets deletes old conditional rules before re-adding", async () => {
    const backend = new MemoryBackend();
    await initializeSheets({ backend, config: config() });
    const runsSheet = (await backend.getSheetMetadata()).find((sheet) => sheet.title === "Runs");
    const ruleCount = runsSheet.conditionalFormatRuleCount;
    assert.ok(ruleCount > 0, "first init should install conditional-format rules");

    const marker = backend.sheetRequests.length;
    await initializeSheets({ backend, config: config() });
    const secondRun = backend.sheetRequests.slice(marker);

    // Every pre-existing rule is deleted, highest index first, before the
    // first re-add - the exact mechanism that keeps live init idempotent.
    const deletes = secondRun.filter((request) => request.deleteConditionalFormatRule);
    assert.equal(deletes.length, ruleCount);
    assert.deepEqual(
      deletes.map((request) => request.deleteConditionalFormatRule.index),
      Array.from({ length: ruleCount }, (_, index) => ruleCount - 1 - index),
    );
    const lastDelete = secondRun.map((request) => Boolean(request.deleteConditionalFormatRule)).lastIndexOf(true);
    const firstAdd = secondRun.findIndex((request) => request.addConditionalFormatRule);
    assert.ok(firstAdd !== -1 && lastDelete < firstAdd);

    // The simulated rule list never accumulates duplicates.
    const again = (await backend.getSheetMetadata()).find((sheet) => sheet.title === "Runs");
    assert.equal(again.conditionalFormatRuleCount, ruleCount);
  });

  it("initializeSheets clears a stale dropdown left on Final Time by an older layout", async () => {
    // Reproduces the reported symptom end-to-end: a sheet that was initialised
    // when Completion Type sat at column index 18 (before Bastion Variant /
    // Blaze Rods were removed) still has a -1/0/1 dropdown on index 18 - which
    // is now Final Time.
    const backend = new MemoryBackend();
    const runs = await backend.ensureSheet("Runs");
    await backend.batchUpdateSpreadsheet({
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId: runs.sheetId,
              startRowIndex: 1,
              endRowIndex: 2500,
              startColumnIndex: 18,
              endColumnIndex: 19,
            },
            rule: {
              condition: {
                type: "ONE_OF_LIST",
                values: [-1, 0, 1].map((value) => ({ userEnteredValue: String(value) })),
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
      ],
    });

    await initializeSheets({ backend, config: config() });

    const after = (await backend.getSheetMetadata()).find((sheet) => sheet.title === "Runs");
    const dropdowns = after.dataValidations.filter((entry) => entry.condition === "ONE_OF_LIST");
    assert.equal(dropdowns.length, 1, "only Completion Type should keep a dropdown");
    assert.equal(dropdowns[0].startColumnIndex, COLUMN_INDEX.completionType);

    // The stale rule on Final Time is gone: index 18 is no longer ONE_OF_LIST.
    const onFinalTime = after.dataValidations.filter(
      (entry) => entry.startColumnIndex <= COLUMN_INDEX.finalTimeMs && COLUMN_INDEX.finalTimeMs < entry.endColumnIndex,
    );
    for (const entry of onFinalTime) {
      assert.notEqual(entry.condition, "ONE_OF_LIST", "Final Time must not keep the -1/0/1 dropdown");
    }

    // Re-running init is idempotent: still exactly one dropdown, still on
    // Completion Type.
    await initializeSheets({ backend, config: config() });
    const twice = (await backend.getSheetMetadata()).find((sheet) => sheet.title === "Runs");
    const twiceDropdowns = twice.dataValidations.filter((entry) => entry.condition === "ONE_OF_LIST");
    assert.equal(twiceDropdowns.length, 1);
    assert.equal(twiceDropdowns[0].startColumnIndex, COLUMN_INDEX.completionType);
  });

  it("runsSheetCellFormatRequests applies duration [mm]:ss.000 and date formats", () => {
    const requests = runsSheetCellFormatRequests({ sheetId: 0, capacity: 10 });
    assert.equal(requests.length, COLUMN_COUNT, "one format request per column");
    // Every repeatCell targets the body (rows 1..capacity) for a single column.
    for (const request of requests) {
      const { repeatCell } = request;
      assert.ok(repeatCell, "expected a repeatCell request");
      assert.equal(repeatCell.range.startRowIndex, 1);
      assert.equal(repeatCell.range.endRowIndex, 10);
      assert.equal(repeatCell.range.endColumnIndex - repeatCell.range.startColumnIndex, 1);
    }
    const columnFor = (key) => requests[COLUMN_INDEX[key]];
    const owSplit = columnFor("owSplitMs").repeatCell;
    assert.equal(owSplit.range.startColumnIndex, COLUMN_INDEX.owSplitMs);
    assert.deepEqual(owSplit.cell.userEnteredFormat.numberFormat, {
      type: "TIME",
      pattern: "[mm]:ss.000",
    });
    const dateCol = columnFor("dateMs").repeatCell;
    assert.deepEqual(dateCol.cell.userEnteredFormat.numberFormat, {
      type: "DATE_TIME",
      pattern: "yyyy-mm-dd hh:mm",
    });
    // Int columns stay plain numbers, text columns stay unformatted.
    assert.deepEqual(columnFor("matchId").repeatCell.cell.userEnteredFormat.numberFormat, {
      type: "NUMBER",
      pattern: "0",
    });
    assert.equal(columnFor("opponent").repeatCell.cell.userEnteredFormat.numberFormat, undefined);
  });
});
