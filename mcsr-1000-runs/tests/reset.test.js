import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { headerRow } from "../src/models/runRecord.js";
import { MemoryBackend } from "../src/sheets/backend.js";
import { readRunsSheet } from "../src/sheets/runSheet.js";
import { RawCache, SyncStateStore } from "../src/sync/rawCache.js";
import { RESET_WARNING, describeReset, performReset, resetTargets } from "../src/sync/reset.js";
import { runSync } from "../src/sync/syncEngine.js";
import { fakeClient, tempDir, testConfig } from "./syncFixtures.js";

/** rootDir owns .env.local; data/ and out/sheet live inside it (git-ignored). */
const resetConfig = (rootDir) => ({
  ...testConfig(path.join(rootDir, "data")),
  fileBackendDir: path.join(rootDir, "out", "sheet"),
  rootDir,
  backend: "memory",
});

const quiet = { log() {}, warn() {} };

describe("reset plan (dry run)", () => {
  it("lists what would be deleted and demands --confirm", () => {
    const { text, targets } = describeReset({ config: resetConfig(tempDir()) });
    assert.ok(text.includes(RESET_WARNING));
    assert.ok(text.includes("npm run reset -- --confirm"));
    assert.ok(text.includes("Runs!A2:AB2500"));
    assert.ok(text.includes("Dashboard!A1:D2500"));
    // The known local artefacts are all listed...
    assert.ok(text.includes("sync-state.json"));
    assert.ok(text.includes("Runs.csv"));
    // ... and env / credentials / source never appear as deletable.
    for (const entry of targets.local) {
      assert.ok(!entry.target.endsWith(".env"), entry.target);
      assert.ok(!entry.target.endsWith(".env.local"), entry.target);
    }
    assert.ok(targets.preserved.some((entry) => entry.endsWith(".env.local")));
    assert.ok(targets.preserved.some((entry) => entry.endsWith(".env")));
  });

  it("only allow-lists generated artefacts", () => {
    const rootDir = tempDir();
    const targets = resetTargets({ config: resetConfig(rootDir) });
    for (const entry of targets.local) {
      assert.ok(entry.target.startsWith(rootDir), entry.target);
      assert.notEqual(entry.target, rootDir);
      assert.ok(!path.basename(entry.target).startsWith(".env"), entry.target);
    }
  });
});

describe("performReset", () => {
  it("clears run rows + local state, preserves .env.local and the sheet", async () => {
    const rootDir = tempDir();
    const config = resetConfig(rootDir);

    const envFile = path.join(rootDir, ".env.local");
    writeFileSync(envFile, "MCSR_PLAYER=AwenRuns\n", "utf8");

    // Local generated state of every kind.
    const cache = new RawCache({ dir: config.dataDir });
    await cache.save(101, { id: 101 });
    await cache.saveLog("unknown-timeline-types.txt", "weird.type\n");
    await cache.saveNormalized([{ matchId: 101 }]);
    await new SyncStateStore({ dir: config.dataDir }).write({ initializedAt: "x" });
    mkdirSync(config.fileBackendDir, { recursive: true });
    for (const file of ["Runs.csv", "Runs.json", "Dashboard.json", "spreadsheet-requests.json"]) {
      writeFileSync(path.join(config.fileBackendDir, file), "[]\n", "utf8");
    }

    // A populated sheet.
    const backend = new MemoryBackend();
    await runSync({
      config,
      backend,
      client: fakeClient(),
      cache,
      state: new SyncStateStore({ dir: config.dataDir }),
      mode: "initial",
      logger: quiet,
    });
    assert.equal((await readRunsSheet({ backend })).records.length, 6);

    const result = await performReset({ config, backend, logger: quiet });
    assert.equal(result.performed, true);
    assert.equal(result.clearedRanges.length, 2);

    // Sheet: no data rows, header intact, both sheets still present.
    const after = await readRunsSheet({ backend });
    assert.deepEqual(after.records, []);
    assert.deepEqual(after.dataRows, []);
    assert.deepEqual((await backend.readValues("Runs!A1:Z1"))[0], headerRow());
    assert.deepEqual((await backend.getSheetTitles()).sort(), ["Dashboard", "Runs"]);

    // Local: every generated artefact is gone.
    assert.equal(existsSync(path.join(config.dataDir, "cache")), false);
    assert.equal(existsSync(path.join(config.dataDir, "logs")), false);
    assert.equal(existsSync(path.join(config.dataDir, "sync-state.json")), false);
    assert.equal(existsSync(path.join(config.dataDir, "normalized-records.json")), false);
    for (const file of ["Runs.csv", "Runs.json", "Dashboard.json", "spreadsheet-requests.json"]) {
      assert.equal(existsSync(path.join(config.fileBackendDir, file)), false, file);
    }

    // Preserved: .env.local (and .env when present).
    assert.equal(existsSync(envFile), true);
    assert.match(readFileSync(envFile, "utf8"), /MCSR_PLAYER/);
  });

  it("a fresh initial sync after reset behaves like a clean install", async () => {
    const rootDir = tempDir();
    const config = resetConfig(rootDir);
    const backend = new MemoryBackend();

    await runSync({
      config,
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir: config.dataDir }),
      state: new SyncStateStore({ dir: config.dataDir }),
      mode: "initial",
      logger: quiet,
    });
    await performReset({ config, backend, logger: quiet });

    const summary = await runSync({
      config,
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir: config.dataDir }),
      state: new SyncStateStore({ dir: config.dataDir }),
      mode: "initial",
      logger: quiet,
    });
    assert.equal(summary.totalMatches, 6);
    const { records } = await readRunsSheet({ backend });
    assert.equal(records.length, 6, "reset must not leave stale rows behind");
    assert.deepEqual(records.map((record) => record.matchNumber), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(
      records.map((record) => record.runNumber ?? null),
      [1, null, null, null, 2, 3],
    );
  });
});