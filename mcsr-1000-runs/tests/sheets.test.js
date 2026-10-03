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
});
