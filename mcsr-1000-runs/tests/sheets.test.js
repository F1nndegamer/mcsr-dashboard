import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "../src/sheets/backend.js";
import { createBackend, ensureSheets, initializeSheets } from "../src/sheets/index.js";
import { readRunsSheet } from "../src/sheets/runSheet.js";

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
});
