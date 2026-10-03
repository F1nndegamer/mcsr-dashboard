import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const PLAYER = "AwenRuns";
export const PLAYER_UUID = "player-uuid";
export const OPPONENT_UUID = "opponent-uuid";
// Oct 10 2026, safely on/after the Oct 3 START_DATE used by the tests.
export const DAY = Math.floor(Date.UTC(2026, 9, 10) / 1000);
export const KINDS = ["WIN", "LOSS", "FORFEIT", "DRAW", "WIN", "WIN"];

export const listEntry = (id, dayOffset, overrides = {}) => ({
  id,
  type: 2,
  season: 9,
  date: DAY + dayOffset * 86_400,
  ...overrides,
});

export const advanced = (id, dayOffset, kind) => {
  const base = {
    id,
    type: 2,
    season: 9,
    date: DAY + dayOffset * 86_400,
    forfeited: false,
    result: { uuid: PLAYER_UUID, time: 600_000 + id },
    players: [
      { uuid: PLAYER_UUID, nickname: PLAYER },
      { uuid: OPPONENT_UUID, nickname: `Rival${id}` },
    ],
    completions: [{ uuid: PLAYER_UUID, time: 600_000 + id }],
    changes: [{ uuid: PLAYER_UUID, eloRate: 1500, change: 5 }],
    seed: { id: `seed${id}`, overworld: "VILLAGE", nether: "TREASURE", endTowers: [80, 88, 90, 100] },
    timelines: [
      { uuid: PLAYER_UUID, time: 60_000, type: "story.enter_the_nether" },
      { uuid: PLAYER_UUID, time: 300_000, type: "story.follow_ender_eye" },
      { uuid: PLAYER_UUID, time: 500_000, type: "story.enter_the_end" },
    ],
  };
  if (kind === "LOSS") {
    return { ...base, result: { uuid: OPPONENT_UUID, time: 590_000 }, completions: [{ uuid: OPPONENT_UUID, time: 590_000 }] };
  }
  if (kind === "FORFEIT") return { ...base, forfeited: true };
  if (kind === "DRAW") return { ...base, result: null, completions: [] };
  return base;
};

export const advancedById = new Map(KINDS.map((kind, index) => [101 + index, advanced(101 + index, index, kind)]));

/** Deterministic fake of the MCSR client surface the sync engine needs. */
export const fakeClient = ({ byId = advancedById, seasons = [9] } = {}) => ({
  calls: { seasonMatches: 0, fetchMatch: 0 },
  async getUser() {
    return { uuid: PLAYER_UUID, nickname: PLAYER };
  },
  async fetchSeasonInfo(season) {
    if (season === undefined) return { number: Math.max(...seasons), startsAt: DAY - 100 * 86_400 };
    return { number: season, startsAt: DAY - 100 * 86_400 };
  },
  async fetchSeasonMatches({ season } = {}) {
    this.calls.seasonMatches += 1;
    if (!seasons.includes(season)) return [];
    return KINDS.map((_, index) => listEntry(101 + index, index));
  },
  async fetchMatch(id) {
    this.calls.fetchMatch += 1;
    return byId.get(id) ?? null;
  },
});

export const testConfig = (dir) => ({
  player: PLAYER,
  startDateMs: Date.UTC(2026, 9, 3),
  startDateIso: "2026-10-03",
  excludeDecayed: true,
  reconcileDays: 0,
  incrementalSeasonLookback: 0,
  sheetRowCapacity: 2500,
  dataDir: dir,
});

export const tempDir = () => mkdtempSync(path.join(tmpdir(), "mcsr-1000-"));
