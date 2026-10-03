import { RESULT, RUNS_SHEET } from "../models/constants.js";
import { computeDataStatus } from "../core/dataStatus.js";
import { assignNumbers } from "../core/numbering.js";
import { RANKED_MATCH_TYPE, planSeasons } from "../mcsr/adapter.js";
import { normalizeMatch } from "../mcsr/normalize.js";
import {
  buildRecordSet,
  planRunsUpdates,
  readRunsSheet,
  writeRunsSheet,
} from "../sheets/runSheet.js";

const DAY_MS = 86_400_000;

/**
 * Lists every relevant ranked match on/after START_DATE for the planned seasons.
 *
 * Malformed entries (missing ids / dates) are skipped with a warning instead of
 * aborting the whole sync.
 */
export const collectCandidateMatches = async ({ client, player, config, seasons, logger = console }) => {
  const byId = new Map();
  const warnings = [];

  for (const season of seasons) {
    logger.log?.(`Listing MCSR season ${season} matches for ${player}...`);
    const matches = await client.fetchSeasonMatches({
      identifier: player,
      season,
      excludeDecayed: config.excludeDecayed,
    });

    for (const match of matches) {
      if (!match || typeof match.id !== "number") {
        warnings.push("Skipped a match entry without a numeric id.");
        continue;
      }
      if (match.type !== undefined && match.type !== RANKED_MATCH_TYPE) {
        warnings.push(`Skipped match ${match.id}: type ${match.type} is not Ranked.`);
        continue;
      }
      if (typeof match.date !== "number") {
        warnings.push(`Skipped match ${match.id}: no usable date.`);
        continue;
      }
      if (config.startDateMs !== null && match.date * 1000 < config.startDateMs) continue;
      if (!byId.has(match.id)) byId.set(match.id, match);
    }
  }

  return { matchesById: byId, warnings };
};

/**
 * Fetches (or loads from the local raw cache) the ADVANCED payload for one
 * match and normalises it.
 */
export const loadNormalized = async ({ client, cache, match, playerUuid, mode, config, now }) => {
  const isRecent = match.date * 1000 >= now() - config.reconcileDays * DAY_MS;
  const cached = await cache.load(match.id);

  // Reconcile mode: always refresh recent matches from the API so late changes
  // (forfeits, Elo corrections) land. Reprocess mode prefers the cache so a
  // full re-derivation never re-downloads the whole history.
  let raw = cached;
  if (mode === "reprocess") {
    raw = cached ?? (await client.fetchMatch(match.id));
  } else if (!cached || isRecent) {
    raw = (await client.fetchMatch(match.id)) ?? cached;
  }

  if (!raw) return null;
  if (raw !== cached) await cache.save(match.id, raw);

  const { record, warnings, unknownTimelineTypes } = normalizeMatch({ match: raw, playerUuid });
  return { record, warnings, unknownTimelineTypes, fromCache: raw === cached };
};

const tally = (records) => {
  const counts = {
    totalMatches: records.length,
    wins: 0,
    losses: 0,
    draws: 0,
    forfeits: 0,
    completedRuns: 0,
    needsInput: 0,
  };
  for (const record of records) {
    if (record.result === RESULT.WIN) counts.wins += 1;
    else if (record.result === RESULT.LOSS) counts.losses += 1;
    else if (record.result === RESULT.DRAW) counts.draws += 1;
    else if (record.result === RESULT.FORFEIT) counts.forfeits += 1;
    if (typeof record.runNumber === "number") counts.completedRuns += 1;
    if (record.dataStatus === "NEEDS INPUT") counts.needsInput += 1;
  }
  return counts;
};

/**
 * Runs one synchronisation pass.
 *
 * @param {Object} args
 * @param {"initial"|"incremental"|"reprocess"} [args.mode]
 * @returns {Promise<Object>} summary
 */
export const runSync = async ({
  config,
  backend,
  client,
  mode = "incremental",
  dryRun = false,
  logger = console,
  now = () => Date.now(),
  cache,
  state,
} = {}) => {
  const warnings = [];
  const unknownTimelineTypes = new Set();

  // --- 1. resolve the tracked player -------------------------------------
  const user = await client.getUser(config.player);
  const playerUuid = user.uuid;
  const playerNickname = user.nickname ?? config.player;
  const previous = (await state?.read?.()) ?? {};
  if (previous.playerUuid && previous.playerUuid !== playerUuid) {
    warnings.push(
      `Tracked player uuid changed from ${previous.playerUuid} to ${playerUuid}; check MCSR_PLAYER.`,
    );
  }
  logger.log?.(`Tracked player: ${playerNickname} (${playerUuid})`);

  // --- 2. which seasons can hold matches on/after START_DATE --------------
  const seasons = await planSeasons({
    client,
    startDateMs: config.startDateMs,
    lookback: mode === "incremental" ? config.incrementalSeasonLookback : 0,
  });
  logger.log?.(`Seasons to scan (newest first): ${seasons.join(", ") || "none"}`);

  // --- 3. candidate matches ----------------------------------------------
  const { matchesById, warnings: listWarnings } = await collectCandidateMatches({
    client,
    player: playerNickname,
    config,
    seasons,
    logger,
  });
  warnings.push(...listWarnings);

  // --- 4. existing sheet state -------------------------------------------
  const { dataRows, records: sheetRecords } = await readRunsSheet({
    backend,
    capacity: config.sheetRowCapacity,
  });
  const existingIds = new Set(sheetRecords.map((record) => record.matchId));
  logger.log?.(`${existingIds.size} match(es) already in the ${RUNS_SHEET} sheet.`);

  // --- 5. fetch + normalise what we need ---------------------------------
  const candidates = [...matchesById.values()].sort(
    (a, b) => a.date - b.date || a.id - b.id,
  );
  const normalizedById = new Map();
  let fetched = 0;
  let reusedFromCache = 0;

  for (const match of candidates) {
    const isRecent = match.date * 1000 >= now() - config.reconcileDays * DAY_MS;
    const isNew = !existingIds.has(match.id);
    const shouldProcess =
      mode === "reprocess" || isNew || (mode !== "reprocess" && isRecent);

    if (!shouldProcess) continue;

    try {
      const result = await loadNormalized({
        client,
        cache,
        match,
        playerUuid,
        mode,
        config,
        now,
      });
      if (!result) {
        warnings.push(`Match ${match.id}: advanced payload unavailable; left unchanged.`);
        continue;
      }
      normalizedById.set(match.id, result.record);
      if (result.fromCache) reusedFromCache += 1;
      else fetched += 1;
      warnings.push(...result.warnings.map((warning) => `Match ${match.id}: ${warning}`));
      result.unknownTimelineTypes.forEach((type) => unknownTimelineTypes.add(type));
    } catch (error) {
      // A single bad match must never abort the whole sync.
      warnings.push(`Match ${match.id}: ${error.message}`);
    }
  }

  // --- 6. merge with the sheet (manual fields always win) ---------------
  const merged = buildRecordSet({ sheetRecords, normalizedById });
  const withStatus = merged.map((record) => ({
    ...record,
    dataStatus: computeDataStatus(record),
  }));
  const ordered = assignNumbers(withStatus);

  // --- 7. write ----------------------------------------------------------
  const plan = planRunsUpdates({
    records: ordered,
    existingRows: dataRows,
    sheetTitle: RUNS_SHEET,
  });
  const writeResult = await writeRunsSheet({ backend, plan, dryRun });

  if (cache && !dryRun) {
    await cache.saveNormalized(
      ordered.map((record) => ({ ...record, timelineRaw: undefined })),
    );
    if (unknownTimelineTypes.size > 0) {
      await cache.saveLog(
        "unknown-timeline-types.txt",
        [...unknownTimelineTypes].sort().join("\n") + "\n",
      );
    }
  }

  const summary = {
    mode,
    dryRun,
    player: playerNickname,
    playerUuid,
    seasons,
    candidates: candidates.length,
    fetched,
    reusedFromCache,
    plannedUpdates: writeResult.rawUpdateCount,
    formulaCells: writeResult.formulaCellCount,
    ...tally(ordered),
    warnings,
    unknownTimelineTypes: [...unknownTimelineTypes].sort(),
    syncedAt: new Date(now()).toISOString(),
  };

  if (state && !dryRun) await state.write(summary);

  return summary;
};

