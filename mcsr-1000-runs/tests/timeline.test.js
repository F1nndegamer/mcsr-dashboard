import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  KNOWN_NON_MILESTONE_IDS,
  SEMANTIC_EVENTS,
  TIMELINE_EVENT_IDS,
  eventForTimelineType,
  formatDuration,
  isKnownTimelineType,
  parseTimelines,
} from "../src/mcsr/timeline.js";
import { deriveSplits } from "../src/core/splits.js";

const PLAYER = "player-uuid";
const OTHER = "opponent-uuid";

const entry = (type, time, uuid = PLAYER) => ({ uuid, time, type });

describe("timeline identifier mapping", () => {
  it("every semantic event has at least one real API identifier", () => {
    for (const event of SEMANTIC_EVENTS) {
      assert.ok(
        Array.isArray(TIMELINE_EVENT_IDS[event]) && TIMELINE_EVENT_IDS[event].length > 0,
        `${event} has no mapped identifier`,
      );
    }
  });

  it("maps the verified live-API identifiers", () => {
    assert.equal(eventForTimelineType("story.enter_the_nether"), "NETHER_ENTER");
    assert.equal(eventForTimelineType("nether.find_bastion"), "BASTION_ENTER");
    assert.equal(eventForTimelineType("nether.find_fortress"), "FORTRESS_ENTER");
    assert.equal(eventForTimelineType("projectelo.timeline.blind_travel"), "BLIND");
    assert.equal(eventForTimelineType("story.follow_ender_eye"), "STRONGHOLD_ENTER");
    assert.equal(eventForTimelineType("story.enter_the_end"), "END_ENTER");
    assert.equal(eventForTimelineType("projectelo.timeline.dragon_death"), "COMPLETE");
    assert.equal(eventForTimelineType("end.kill_dragon"), "COMPLETE");
  });

  it("only uses the opponent's entries for nobody", () => {
    const { events } = parseTimelines({
      timelines: [entry("story.enter_the_nether", 60_000, OTHER)],
      playerUuid: PLAYER,
    });
    assert.deepEqual(events, {});
  });
});

describe("parseTimelines", () => {
  it("keeps the earliest timestamp per event and ignores other players", () => {
    const { events, unknownTypes } = parseTimelines({
      timelines: [
        entry("story.enter_the_nether", 90_000),
        entry("story.enter_the_nether", 60_000),
        entry("story.enter_the_nether", 10_000, OTHER),
        entry("story.enter_the_end", 500_000),
      ],
      playerUuid: PLAYER,
    });
    assert.equal(events.NETHER_ENTER, 60_000);
    assert.equal(events.END_ENTER, 500_000);
    assert.deepEqual(unknownTypes, []);
  });

  it("prefers the authoritative completions time for COMPLETE", () => {
    const { events } = parseTimelines({
      timelines: [entry("projectelo.timeline.dragon_death", 999_999)],
      playerUuid: PLAYER,
      completionMs: 600_000,
    });
    assert.equal(events.COMPLETE, 600_000);
  });

  it("reports unknown identifiers instead of swallowing them", () => {
    const { unknownTypes } = parseTimelines({
      timelines: [entry("story.some_future_advancement", 1_000)],
      playerUuid: PLAYER,
    });
    assert.deepEqual(unknownTypes, ["story.some_future_advancement"]);
  });

  it("known non-milestone ids are not reported as unknown", () => {
    const { unknownTypes } = parseTimelines({
      timelines: KNOWN_NON_MILESTONE_IDS.map((type, i) => entry(type, i + 1)),
      playerUuid: PLAYER,
    });
    assert.deepEqual(unknownTypes, []);
    assert.ok(isKnownTimelineType("nether.obtain_crying_obsidian"));
  });
});

describe("deriveSplits", () => {
  const events = {
    NETHER_ENTER: 60_000,
    BASTION_ENTER: 120_000,
    FORTRESS_ENTER: 200_000,
    STRONGHOLD_ENTER: 300_000,
    END_ENTER: 500_000,
    COMPLETE: 600_000,
  };

  it("derives OW / Nether / Bastion / End splits from the spec definitions", () => {
    const splits = deriveSplits({ events });
    assert.equal(splits.owSplitMs, 60_000);
    assert.equal(splits.netherSplitMs, 240_000);
    assert.equal(splits.bastionTimeMs, 80_000);
    assert.equal(splits.endSplitMs, 100_000);
    assert.equal(splits.finalTimeMs, 600_000);
  });

  it("leaves a split blank (with a logged reason) when an endpoint is missing", () => {
    const splits = deriveSplits({ events: { NETHER_ENTER: 60_000 } });
    assert.equal(splits.owSplitMs, 60_000);
    assert.equal(splits.netherSplitMs, undefined);
    assert.equal(splits.bastionTimeMs, undefined);
    assert.equal(splits.endSplitMs, undefined);
    assert.equal(splits.finalTimeMs, undefined);
    assert.ok(splits.notes.some((note) => note.includes("Nether Split")));
    assert.ok(splits.notes.some((note) => note.includes("Bastion Time")));
  });

  it("formatDuration renders spreadsheet-friendly human times", () => {
    assert.equal(formatDuration(61_500), "1:01.500");
    assert.equal(formatDuration(3_661_000), "1:01:01.000");
    assert.equal(formatDuration(undefined), "");
  });
});
