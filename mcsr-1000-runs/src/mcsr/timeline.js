/**
 * Centralised MCSR Ranked timeline identifier mapping.
 *
 * VERIFIED against live `GET https://api.mcsrranked.com/matches/{id}` responses
 * (see README -> "Discovered timeline identifiers"). The `type` values returned
 * by the API are Minecraft advancement identifiers plus two ProjectElo custom
 * identifiers; they are NOT the semantic names in the task brief.
 *
 * @typedef {Object} RawTimelineEntry
 * @property {string} uuid  player uuid (no dashes)
 * @property {number} time  match time in milliseconds
 * @property {string} type  MCSR timeline identifier
 */

/** Semantic event -> list of API identifiers that mean that event. */
export const TIMELINE_EVENT_IDS = Object.freeze({
  NETHER_ENTER: ["story.enter_the_nether"],
  BASTION_ENTER: ["nether.find_bastion"],
  FORTRESS_ENTER: ["nether.find_fortress"],
  BLIND: ["projectelo.timeline.blind_travel"],
  // The API exposes no dedicated "stronghold enter" advancement. The MCSR
  // timeline uses the Follow Ender Eye advancement, which is also what the
  // existing dashboard in this repo maps to the Stronghold phase.
  STRONGHOLD_ENTER: ["story.follow_ender_eye"],
  END_ENTER: ["story.enter_the_end"],
  // dragon_death is the milestone the API records when the dragon dies.
  // `end.kill_dragon` / `projectelo.timeline.complete` are accepted aliases.
  COMPLETE: [
    "projectelo.timeline.dragon_death",
    "end.kill_dragon",
    "projectelo.timeline.complete",
  ],
});

/** Semantic events in chronological order. */
export const SEMANTIC_EVENTS = Object.freeze([
  "NETHER_ENTER",
  "BASTION_ENTER",
  "FORTRESS_ENTER",
  "BLIND",
  "STRONGHOLD_ENTER",
  "END_ENTER",
  "COMPLETE",
]);

/**
 * Identifiers observed in real responses that are NOT milestone events.
 * Listing them keeps the "unknown timeline type" log meaningful instead of
 * noisy. Anything not in here and not in TIMELINE_EVENT_IDS is reported.
 */
export const KNOWN_NON_MILESTONE_IDS = Object.freeze([
  "projectelo.timeline.reset",
  "story.root",
  "story.mine_stone",
  "story.smelt_iron",
  "story.iron_tools",
  "story.lava_bucket",
  "story.form_obsidian",
  "story.obtain_armor",
  "story.mine_diamond",
  "adventure.root",
  "adventure.kill_a_mob",
  "adventure.ol_betsy",
  "husbandry.root",
  "nether.root",
  "nether.loot_bastion",
  "nether.obtain_blazing_rods",
  "nether.obtain_blaze_rod",
  "nether.obtain_crying_obsidian",
  "nether.distract_piglin",
  "end.root",
]);

const ID_TO_EVENT = (() => {
  const map = new Map();
  for (const [event, ids] of Object.entries(TIMELINE_EVENT_IDS)) {
    for (const id of ids) map.set(id, event);
  }
  return map;
})();

export const eventForTimelineType = (type) => ID_TO_EVENT.get(type) ?? null;

export const isKnownTimelineType = (type) =>
  ID_TO_EVENT.has(type) || KNOWN_NON_MILESTONE_IDS.includes(type);

/** Milliseconds -> human readable `m:ss.mmm` / `h:mm:ss.mmm`. */
export const formatDuration = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const negative = ms < 0;
  const total = Math.abs(Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const head = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : `${minutes}`;
  return `${negative ? "-" : ""}${head}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
};

/**
 * Extracts the semantic milestones for one player from a match's timelines.
 *
 * Uses the EARLIEST timestamp seen for each event, because a player can trigger
 * an advancement twice (e.g. re-entering the Nether) and the match split is the
 * first occurrence.
 *
 * @param {Object} args
 * @param {RawTimelineEntry[]} args.timelines
 * @param {string} args.playerUuid
 * @param {number} [args.completionMs] authoritative time from `completions[]`
 * @returns {{events: Record<string, number>, raw: RawTimelineEntry[], unknownTypes: string[]}}
 */
export const parseTimelines = ({ timelines = [], playerUuid, completionMs } = {}) => {
  const events = {};
  const unknownTypes = [];
  const raw = [];

  for (const entry of timelines) {
    if (!entry || entry.uuid !== playerUuid) continue;
    raw.push(entry);
    const event = eventForTimelineType(entry.type);
    if (!event) {
      if (!isKnownTimelineType(entry.type)) unknownTypes.push(entry.type);
      continue;
    }
    if (typeof entry.time !== "number") continue;
    if (!(event in events) || entry.time < events[event]) events[event] = entry.time;
  }

  raw.sort((a, b) => a.time - b.time);

  // The completion record is authoritative for "Complete": for a real win it
  // equals result.time, and it exists even when dragon_death is absent.
  if (typeof completionMs === "number" && Number.isFinite(completionMs)) {
    events.COMPLETE = completionMs;
  }

  return { events, raw, unknownTypes: [...new Set(unknownTypes)] };
};
