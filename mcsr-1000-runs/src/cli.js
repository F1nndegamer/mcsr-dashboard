#!/usr/bin/env node
import { MODULE_ROOT, loadConfigFromDisk } from "../config/config.js";
import { DASHBOARD_SHEET, RUNS_SHEET } from "./models/constants.js";
import { McsrApiClient } from "./mcsr/adapter.js";
import { normalizeMatch } from "./mcsr/normalize.js";
import {
  KNOWN_NON_MILESTONE_IDS,
  SEMANTIC_EVENTS,
  TIMELINE_EVENT_IDS,
  formatDuration,
} from "./mcsr/timeline.js";
import { createBackend, ensureSheets, initializeSheets, updateLastSynced } from "./sheets/index.js";
import { dashboardBuild } from "./sheets/dashboard.js";
import { GoogleAuthError } from "./sheets/googleAuth.js";
import { SheetsApiError } from "./sheets/googleSheets.js";
import { RawCache, SyncStateStore } from "./sync/rawCache.js";
import { runSync } from "./sync/syncEngine.js";

const USAGE = `mcsr-1000-runs

Commands:
  init-sheet                 create/repair the Runs + Dashboard sheets
  sync [--initial]           initial import of every match since START_DATE
       [--reprocess]         re-derive every row from the cached raw payloads
       [--dry-run]           plan the writes but do not touch the sheet
  timeline-map               print the MCSR timeline identifier mapping
  probe [--count N]          dump N real matches + the normalised record (debug)

Overrides:
  --backend=google|file|memory
  --spreadsheet=<id>
`;

const parseArgs = (argv) => {
  const [command = "help", ...rest] = argv;
  const flags = new Set(rest.filter((arg) => !arg.includes("=")));
  const options = {};
  for (const arg of rest) {
    const eq = arg.indexOf("=");
    if (eq > 0) options[arg.slice(0, eq).replace(/^--/, "")] = arg.slice(eq + 1);
  }
  return { command, flags, options };
};

const buildRuntime = async ({ config, logger, createSpreadsheet }) => {
  const client = new McsrApiClient({
    privateKey: config.mcsrPrivateKey,
    logger,
  });
  const { backend, spreadsheetId } = await createBackend({ config, createSpreadsheet, logger });
  const cache = new RawCache({ dir: config.dataDir });
  const state = new SyncStateStore({ dir: config.dataDir });
  return { client, backend, cache, state, spreadsheetId };
};

const printSummary = (summary) => {
  const lines = [
    `mode................ ${summary.mode}${summary.dryRun ? " (dry run)" : ""}`,
    `player.............. ${summary.player} (${summary.playerUuid})`,
    `seasons scanned..... ${summary.seasons.join(", ")}`,
    `candidate matches... ${summary.candidates}`,
    `advanced fetched.... ${summary.fetched} (${summary.reusedFromCache} from cache)`,
    `total matches....... ${summary.totalMatches}`,
    `completed runs...... ${summary.completedRuns} / 1000`,
    `wins................ ${summary.wins}`,
    `losses.............. ${summary.losses}`,
    `draws............... ${summary.draws}`,
    `forfeits............ ${summary.forfeits}`,
    `rows needing input.. ${summary.needsInput}`,
    `cell updates planned ${summary.plannedUpdates} + ${summary.formulaCells} formula cells`,
  ];
  console.log(`\n${lines.join("\n")}`);

  if (summary.unknownTimelineTypes.length > 0) {
    console.log(
      `\nUNKNOWN TIMELINE TYPES (logged to ${"data/logs/unknown-timeline-types.txt"}):\n  ${summary.unknownTimelineTypes.join("\n  ")}`,
    );
  }
  const notableWarnings = summary.warnings.filter((warning) => !warning.includes("unavailable"));
  if (notableWarnings.length > 0) {
    console.log(`\nWARNINGS (${summary.warnings.length} total, ${notableWarnings.length} notable):`);
    notableWarnings.slice(0, 25).forEach((warning) => console.log(`  - ${warning}`));
    if (notableWarnings.length > 25) console.log(`  ... ${notableWarnings.length - 25} more`);
  }
};

const printTimelineMap = () => {
  console.log("MCSR Ranked timeline identifier mapping (verified against live API)\n");
  console.log("Semantic event    -> API timeline `type` value(s)");
  console.log("-".repeat(72));
  for (const event of SEMANTIC_EVENTS) {
    console.log(`${event.padEnd(17)} -> ${TIMELINE_EVENT_IDS[event].join(", ")}`);
  }
  console.log(`\nObserved, intentionally ignored advancement ids (${KNOWN_NON_MILESTONE_IDS.length}):`);
  KNOWN_NON_MILESTONE_IDS.forEach((id) => console.log(`  ${id}`));
};

const probe = async ({ config, count, logger }) => {
  const client = new McsrApiClient({ privateKey: config.mcsrPrivateKey, logger });
  const user = await client.getUser(config.player);
  logger.log(`Player: ${user.nickname} (${user.uuid})`);

  const matches = await client.listUserMatches({
    identifier: user.nickname,
    sort: "newest",
    count,
    excludeDecayed: config.excludeDecayed,
  });
  logger.log(`Fetched ${matches.length} match(es) from the current season.\n`);

  const unknown = new Set();
  for (const match of matches) {
    const raw = await client.fetchMatch(match.id);
    if (!raw) {
      logger.log(`match ${match.id}: advanced payload unavailable`);
      continue;
    }
    const { record, unknownTimelineTypes } = normalizeMatch({ match: raw, playerUuid: user.uuid });
    unknownTimelineTypes.forEach((type) => unknown.add(type));

    logger.log(
      [
        `match ${record.matchId}  ${new Date(record.dateMs).toISOString().slice(0, 16)}  season ${record.season}`,
        `  opponent=${record.opponent} result=${record.result} counts=${record.countsToward1000} forfeited=${raw.forfeited}`,
        `  winner===player: ${raw.result?.uuid === user.uuid}   completions=[${(raw.completions ?? []).map((c) => `${c.uuid.slice(0, 6)}@${c.time}`).join(", ")}]`,
        `  elo: before=${record.eloBefore ?? "-"} change=${record.eloChange ?? "-"} after=${record.eloAfter ?? "-"}`,
        `  seed=${record.seed || "-"} seedTypeRaw=${record.seedTypeRaw || "-"} bastionTypeRaw=${record.bastionTypeRaw || "-"} towers=[${record.endTowerHeights.join(",")}]`,
        `  OW=${formatDuration(record.owSplitMs)} Nether=${formatDuration(record.netherSplitMs)} Bastion=${formatDuration(record.bastionTimeMs)} End=${formatDuration(record.endSplitMs)} Final=${formatDuration(record.finalTimeMs)}`,
        `  semantic events: ${Object.entries(record.timelineEvents).map(([k, v]) => `${k}@${v}`).join(" ")}`,
      ].join("\n"),
    );
  }

  if (unknown.size > 0) {
    logger.log(`\nUNKNOWN timeline types: ${[...unknown].sort().join(", ")}`);
  } else {
    logger.log("\nNo unknown timeline types encountered.");
  }
  logger.log("");
  printTimelineMap();
};

const main = async () => {
  const { command, flags, options } = parseArgs(process.argv.slice(2));
  const logger = console;

  if (command === "help" || flags.has("--help")) {
    logger.log(USAGE);
    return 0;
  }

  const config = loadConfigFromDisk({ rootDir: MODULE_ROOT });
  if (options.backend) config.backend = options.backend;
  if (options.spreadsheet) config.spreadsheetId = options.spreadsheet;

  if (command === "timeline-map") {
    printTimelineMap();
    return 0;
  }

  if (config.startDateMs === null) {
    logger.error("START_DATE is required (YYYY-MM-DD). Set it in mcsr-1000-runs/.env.local.");
    return 2;
  }
  logger.log(
    `Player ${config.player} | START_DATE ${config.startDateIso} | backend ${config.backend}\n`,
  );

  if (command === "probe") {
    await probe({ config, count: Number(options.count ?? 5), logger });
    return 0;
  }

  if (command === "init-sheet") {
    const runtime = await buildRuntime({ config, logger, createSpreadsheet: true });
    const result = await initializeSheets({
      backend: runtime.backend,
      config,
      logger,
    });
    await runtime.state.write({ initializedAt: new Date().toISOString(), spreadsheetId: runtime.spreadsheetId });
    logger.log(
      `Sheets ready (new header written: ${result.headerWritten}). Runs + Dashboard configured.`,
    );
    if (config.backend === "google" && !config.spreadsheetId && runtime.spreadsheetId) {
      logger.log(`\nAdd this to mcsr-1000-runs/.env.local:\nSPREADSHEET_ID=${runtime.spreadsheetId}`);
    }
    return 0;
  }

  if (command === "sync") {
    const mode = flags.has("--initial")
      ? "initial"
      : flags.has("--reprocess")
        ? "reprocess"
        : "incremental";

    const runtime = await buildRuntime({ config, logger, createSpreadsheet: false });
    await ensureSheets({ backend: runtime.backend, config, logger });

    const summary = await runSync({
      config,
      backend: runtime.backend,
      client: runtime.client,
      cache: runtime.cache,
      state: runtime.state,
      mode,
      dryRun: flags.has("--dry-run"),
      logger,
    });

    printSummary(summary);

    if (!flags.has("--dry-run")) {
      await updateLastSynced({
        backend: runtime.backend,
        dashboard: dashboardBuild({ capacity: config.sheetRowCapacity }),
        value: summary.syncedAt,
      });
      if (typeof runtime.backend.writeCsv === "function") {
        const file = await runtime.backend.writeCsv();
        logger.log(`\nWrote local CSV mirror: ${file}`);
      }
    }
    return 0;
  }

  logger.error(`Unknown command "${command}".\n\n${USAGE}`);
  return 2;
};

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(`\n${error.name ?? "Error"}: ${error.message}`);
    if (error instanceof GoogleAuthError) {
      console.error("\nSet up Google credentials - see mcsr-1000-runs/README.md.");
    } else if (error instanceof SheetsApiError) {
      console.error(
        "\nGoogle Sheets rejected the request. If this is 'The caller does not have permission'," +
          " share the spreadsheet with the authenticated account.",
      );
    }
    if (process.env.MCSR_DEBUG) console.error(error);
    process.exit(1);
  });

