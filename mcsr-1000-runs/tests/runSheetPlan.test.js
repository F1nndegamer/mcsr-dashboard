import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "../src/sheets/backend.js";
import { readRunsSheet } from "../src/sheets/runSheet.js";
import { RawCache, SyncStateStore } from "../src/sync/rawCache.js";
import { collectCandidateMatches, loadNormalized, runSync } from "../src/sync/syncEngine.js";
import { DAY, PLAYER, PLAYER_UUID, advanced, fakeClient, listEntry, tempDir, testConfig } from "./syncFixtures.js";

describe("collectCandidateMatches", () => {
  it("keeps ranked matches on/after START_DATE and drops the rest", async () => {
    const client = {
      async fetchSeasonMatches() {
        return [
          listEntry(1, -1000),
          listEntry(2, 1000),
          listEntry(3, 1001, { type: 1 }),
          { id: "bad", date: DAY },
          listEntry(4, 1002, { date: undefined }),
        ];
      },
    };
    const { matchesById, warnings } = await collectCandidateMatches({
      client,
      player: PLAYER,
      config: { startDateMs: Date.UTC(2026, 9, 3), excludeDecayed: true },
      seasons: [9],
      logger: { log() {} },
    });
    assert.deepEqual([...matchesById.keys()], [2]);
    assert.ok(warnings.some((w) => w.includes("not Ranked")));
  });
});

describe("loadNormalized", () => {
  it("reprocess mode prefers the cache so history is not re-downloaded", async () => {
    const dir = tempDir();
    const cache = new RawCache({ dir });
    await cache.save(777, advanced(777, 5, "WIN"));
    let fetched = 0;
    const client = { async fetchMatch() { fetched += 1; return advanced(777, 5, "LOSS"); } };
    const result = await loadNormalized({
      client,
      cache,
      match: listEntry(777, 5000),
      playerUuid: PLAYER_UUID,
      mode: "reprocess",
      config: { reconcileDays: 0 },
      now: () => Date.now(),
    });
    assert.equal(fetched, 0);
    assert.equal(result.record.result, "WIN");
    assert.equal(result.fromCache, true);
  });
});

describe("runSync end to end (memory backend, fake MCSR API)", () => {
  it("imports WIN/LOSS/FORFEIT/DRAW/WIN/WIN with Run # 1,blank,blank,blank,2,3", async () => {
    const dir = tempDir();
    const backend = new MemoryBackend();
    const summary = await runSync({
      config: testConfig(dir),
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir }),
      state: new SyncStateStore({ dir }),
      mode: "initial",
      logger: { log() {}, warn() {} },
    });
    assert.equal(summary.totalMatches, 6);
    assert.equal(summary.completedRuns, 3);
    assert.deepEqual([summary.wins, summary.losses, summary.draws, summary.forfeits], [3, 1, 1, 1]);

    const { records } = await readRunsSheet({ backend });
    const byMatch = new Map(records.map((r) => [r.matchId, r]));
    const ids = [101, 102, 103, 104, 105, 106];
    assert.deepEqual(ids.map((id) => byMatch.get(id).result), ["WIN", "LOSS", "FORFEIT", "DRAW", "WIN", "WIN"]);
    assert.deepEqual(ids.map((id) => byMatch.get(id).runNumber ?? null), [1, null, null, null, 2, 3]);
    assert.deepEqual(ids.map((id) => byMatch.get(id).matchNumber), [1, 2, 3, 4, 5, 6]);
    const cache = new RawCache({ dir });
    assert.deepEqual(await cache.listMatchIds(), ids);
  });

  it("a second sync creates no duplicates and preserves manual fields", async () => {
    const dir = tempDir();
    const backend = new MemoryBackend();
    const cache = new RawCache({ dir });
    const state = new SyncStateStore({ dir });
    const config = testConfig(dir);
    const quiet = { log() {}, warn() {} };
    await runSync({ config, backend, client: fakeClient(), cache, state, mode: "initial", logger: quiet });

    await backend.batchUpdateValues({
      updates: [
        { range: "Runs!N2", values: [["Triple Triple"]] },
        { range: "Runs!P2", values: [[6]] },
        { range: "Runs!S2", values: [[0]] },
        { range: "Runs!V2", values: [[1]] },
        { range: "Runs!W2", values: [["burnt"]] },
        { range: "Runs!AA2", values: [["my note"]] },
      ],
    });

    const second = await runSync({
      config, backend, client: fakeClient(), cache, state, mode: "incremental", logger: quiet,
    });
    assert.equal(second.totalMatches, 6);
    const { records, dataRows } = await readRunsSheet({ backend });
    assert.equal(records.length, 6);
    assert.equal(dataRows.length, 6);
    const first = records.find((r) => r.matchId === 101);
    assert.equal(first.bastionVariant, "Triple Triple");
    assert.equal(first.blazeRods, 6);
    assert.equal(first.completionType, 0);
    assert.equal(first.deaths, 1);
    assert.equal(first.deathMessages, "burnt");
    assert.equal(first.notes, "my note");
  });

  it("dry runs plan writes without touching the sheet", async () => {
    const dir = tempDir();
    const backend = new MemoryBackend();
    const summary = await runSync({
      config: testConfig(dir),
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir }),
      mode: "initial",
      dryRun: true,
      logger: { log() {}, warn() {} },
    });
    assert.equal(summary.dryRun, true);
    const { records } = await readRunsSheet({ backend });
    assert.deepEqual(records, []);
  });
});