import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeMatch } from "../src/mcsr/normalize.js";

const PLAYER = "player-uuid";
const OPPONENT = "opponent-uuid";

const baseMatch = (overrides = {}) => ({
  id: 4242,
  type: 2,
  season: 9,
  date: 1_790_000_000,
  forfeited: false,
  result: { uuid: PLAYER, time: 600_000 },
  players: [
    { uuid: PLAYER, nickname: "AwenRuns" },
    { uuid: OPPONENT, nickname: "Rival" },
  ],
  completions: [{ uuid: PLAYER, time: 600_000 }],
  changes: [{ uuid: PLAYER, eloRate: 1500, change: 12 }],
  seed: { id: "mtf37jg2v018mtm4", overworld: "VILLAGE", nether: "TREASURE", endTowers: [79, 88, 91, 103] },
  timelines: [
    { uuid: PLAYER, time: 60_000, type: "story.enter_the_nether" },
    { uuid: PLAYER, time: 120_000, type: "nether.find_bastion" },
    { uuid: PLAYER, time: 200_000, type: "nether.find_fortress" },
    { uuid: PLAYER, time: 300_000, type: "story.follow_ender_eye" },
    { uuid: PLAYER, time: 500_000, type: "story.enter_the_end" },
  ],
  ...overrides,
});

describe("normalizeMatch", () => {
  it("normalises a genuine WIN with splits, Elo and seed mappings", () => {
    const { record, unknownTimelineTypes } = normalizeMatch({
      match: baseMatch(),
      playerUuid: PLAYER,
    });
    assert.equal(record.matchId, 4242);
    assert.equal(record.result, "WIN");
    assert.equal(record.countsToward1000, true);
    assert.equal(record.opponent, "Rival");
    assert.equal(record.finalTimeMs, 600_000);
    assert.equal(record.owSplitMs, 60_000);
    assert.equal(record.netherSplitMs, 240_000);
    assert.equal(record.bastionTimeMs, 80_000);
    assert.equal(record.endSplitMs, 100_000);
    assert.equal(record.eloBefore, 1500);
    assert.equal(record.eloChange, 12);
    assert.equal(record.eloAfter, 1512);
    // Filtered seed id is preserved, never relabelled as a numeric seed.
    assert.equal(record.seed, "mtf37jg2v018mtm4");
    assert.equal(record.seedId, "mtf37jg2v018mtm4");
    assert.equal(record.minecraftSeed, null);
    assert.equal(record.seedType, "Village");
    assert.equal(record.bastionType, "Treasure");
    assert.equal(record.endTowers, "79/88/91/103");
    assert.deepEqual(record.endTowerHeights, [79, 88, 91, 103]);
    assert.deepEqual(unknownTimelineTypes, []);
  });

  it("classifies an opponent forfeit as FORFEIT even when the API credits the player", () => {
    const { record } = normalizeMatch({
      match: baseMatch({ forfeited: true }),
      playerUuid: PLAYER,
    });
    assert.equal(record.result, "FORFEIT");
    assert.equal(record.countsToward1000, false);
  });

  it("classifies an opponent completion as LOSS", () => {
    const { record } = normalizeMatch({
      match: baseMatch({
        result: { uuid: OPPONENT, time: 590_000 },
        completions: [{ uuid: OPPONENT, time: 590_000 }],
        forfeited: false,
      }),
      playerUuid: PLAYER,
    });
    assert.equal(record.result, "LOSS");
    assert.equal(record.countsToward1000, false);
    // No personal completion, so no final time and no end split.
    assert.equal(record.finalTimeMs, undefined);
    assert.equal(record.endSplitMs, undefined);
  });

  it("classifies a missing winner as DRAW", () => {
    const { record } = normalizeMatch({
      match: baseMatch({ result: null, completions: [], forfeited: false }),
      playerUuid: PLAYER,
    });
    assert.equal(record.result, "DRAW");
    assert.equal(record.countsToward1000, false);
  });

  it("throws on a malformed payload instead of inventing a row", () => {
    assert.throws(() => normalizeMatch({ match: { id: "nope" }, playerUuid: PLAYER }));
  });
});
