import { classifyMatch } from "../core/classifier.js";
import { deriveSplits } from "../core/splits.js";
import { formatEndTowers, mapBastionType, mapSeedType } from "./seed.js";
import { parseTimelines } from "./timeline.js";

/** The player's authoritative completion record, if they finished. */
export const extractCompletion = (match, playerUuid) => {
  const completions = Array.isArray(match?.completions) ? match.completions : [];
  const mine = completions.find((entry) => entry?.uuid === playerUuid);
  if (!mine || typeof mine.time !== "number") return { completionMs: undefined, completed: false };
  return { completionMs: mine.time, completed: true };
};

/** Picks the tracked player + their opponent out of the players array. */
export const resolvePlayers = (match, playerUuid) => {
  const players = Array.isArray(match?.players) ? match.players : [];
  const self = players.find((player) => player?.uuid === playerUuid) ?? null;
  const opponent = players.find((player) => player?.uuid !== playerUuid) ?? null;
  return { self, opponent };
};

/** Extracts the Elo triple from `changes[]` for one player. */
export const extractElo = (match, playerUuid) => {
  const changes = Array.isArray(match?.changes) ? match.changes : [];
  const entry = changes.find((change) => change?.uuid === playerUuid);
  if (!entry) return {};

  const before = typeof entry.eloRate === "number" ? entry.eloRate : undefined;
  const change = typeof entry.change === "number" ? entry.change : undefined;
  if (before === undefined && change === undefined) return {};

  return {
    eloBefore: before,
    eloChange: change,
    eloAfter: before !== undefined && change !== undefined ? before + change : undefined,
  };
};

/**
 * Converts one ADVANCED match payload (GET /matches/{id}) into a normalised
 * record. Manual fields are deliberately absent - they are merged in from the
 * spreadsheet by the sync engine so they can never be clobbered.
 *
 * @returns {{record: Object, warnings: string[], unknownTimelineTypes: string[]}}
 */
export const normalizeMatch = ({ match, playerUuid, utcOffsetMinutes = 0 } = {}) => {
  const warnings = [];
  if (!match || typeof match !== "object" || typeof match.id !== "number") {
    throw new Error("normalizeMatch received a malformed match payload.");
  }

  const { self, opponent } = resolvePlayers(match, playerUuid);
  if (!self) {
    warnings.push(`Tracked player uuid ${playerUuid} not present in match ${match.id}.`);
  }

  const { completionMs, completed } = extractCompletion(match, playerUuid);
  const { events, raw, unknownTypes } = parseTimelines({
    timelines: match.timelines,
    playerUuid,
    completionMs,
  });

  const splits = deriveSplits({ events, finalTimeMs: completionMs });
  const classification = classifyMatch({
    forfeited: match.forfeited,
    winnerUuid: match.result?.uuid ?? null,
    playerUuid,
    opponentUuid: opponent?.uuid ?? null,
  });

  const seed = match.seed ?? null;
  const seedWarnings = [];
  const bastionTypeRaw = match.bastionType ?? seed?.nether ?? "";
  const seedTypeRaw = match.seedType ?? seed?.overworld ?? "";

  const record = {
    matchId: match.id,
    matchType: match.type,
    dateMs: typeof match.date === "number" ? match.date * 1000 : undefined,
    season: typeof match.season === "number" ? match.season : undefined,
    opponent: opponent?.nickname ?? "",
    result: classification.result,
    countsToward1000: classification.countsToward1000,

    // The API exposes the MCSR *filtered seed id*, never the numeric Minecraft
    // seed. Both are kept explicit so nothing is mislabelled later.
    seed: seed?.id ?? "",
    seedId: seed?.id ?? "",
    minecraftSeed: null,
    seedType: mapSeedType(seedTypeRaw, { warnings: seedWarnings }),
    seedTypeRaw,
    seedOverworldRaw: seed?.overworld ?? "",
    seedVariations: Array.isArray(seed?.variations) ? seed.variations : [],

    owSplitMs: splits.owSplitMs,
    netherSplitMs: splits.netherSplitMs,
    bastionType: mapBastionType(bastionTypeRaw, { warnings: seedWarnings }),
    bastionTypeRaw,
    bastionTimeMs: splits.bastionTimeMs,
    endSplitMs: splits.endSplitMs,
    endTowers: formatEndTowers(seed?.endTowers),
    endTowerHeights: Array.isArray(seed?.endTowers) ? [...seed.endTowers] : [],
    finalTimeMs: splits.finalTimeMs,
    completed,

    ...extractElo(match, playerUuid),

    // non-column metadata, kept for the raw cache and future reprocessing
    timelineEvents: events,
    timelineRaw: raw,
    decayed: match.decayed === true,
    replayExists: match.replayExists ?? match.replayExist ?? false,
    category: match.category ?? null,
    gameMode: match.gameMode ?? null,
    beginner: match.beginner === true,
    warnings: [...warnings, ...classification.warnings, ...seedWarnings, ...splits.notes],
  };

  return { record, warnings: record.warnings, unknownTimelineTypes: unknownTypes };
};
