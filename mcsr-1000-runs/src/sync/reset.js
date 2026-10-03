import { rm } from "node:fs/promises";
import path from "node:path";
import { DASHBOARD_SHEET, RUNS_SHEET } from "../models/constants.js";
import { initializeSheets } from "../sheets/index.js";

/**
 * `npm run reset` - restore the tracker to a fresh-install state.
 *
 * Scope rules (enforced by `resetTargets`, which only ever returns an
 * allow-list of known generated artefacts):
 *   - spreadsheet: clear the Runs data rows and the Dashboard grid, then
 *     re-apply header/formatting. The spreadsheet is NEVER deleted or
 *     renamed, and no outside range is touched.
 *   - local: raw match cache, sync state, logs and the file-backend mirror.
 *   - preserved: .env, .env.local, OAuth/service-account credentials, all
 *     source code, package files and the spreadsheet document itself.
 */

export const RESET_WARNING =
  "This will erase all tracked runs and local sync state, but will preserve .env.local, source code, credentials, and the spreadsheet itself.";

/**
 * The complete allow-list of what a reset touches. Anything not listed here
 * is preserved by construction.
 *
 * The Runs clear range deliberately ends at column AB: that covers both the
 * current schema and the legacy 28-column layout, so no trace of an old row
 * survives. Column A (row 1 header) is never included.
 */
export const resetTargets = ({ config }) => {
  const dataDir = config.dataDir;
  const outDir = config.fileBackendDir;
  const capacity = config.sheetRowCapacity ?? 2500;
  const rootDir = config.rootDir ?? process.cwd();

  return {
    runsClearRange: `${RUNS_SHEET}!A2:AB${capacity}`,
    dashboardClearRange: `${DASHBOARD_SHEET}!A1:D${capacity}`,
    local: [
      { label: "raw match cache", target: path.join(dataDir, "cache") },
      { label: "sync logs", target: path.join(dataDir, "logs") },
      { label: "sync state", target: path.join(dataDir, "sync-state.json") },
      { label: "normalised records", target: path.join(dataDir, "normalized-records.json") },
      { label: "sheet mirror (Runs)", target: path.join(outDir, "Runs.json") },
      { label: "sheet mirror (Dashboard)", target: path.join(outDir, "Dashboard.json") },
      { label: "sheet request log", target: path.join(outDir, "spreadsheet-requests.json") },
      { label: "CSV export", target: path.join(outDir, "Runs.csv") },
    ],
    preserved: [
      path.join(rootDir, ".env"),
      path.join(rootDir, ".env.local"),
      "source code (src/, config/, tests/, package.json)",
      "Google / OAuth credentials (env or key files)",
      "the spreadsheet document (only the known ranges above are cleared)",
    ],
  };
};

/** Human-readable dry-run report - printed when `--confirm` is missing. */
export const describeReset = ({ config }) => {
  const targets = resetTargets({ config });
  const text = [
    RESET_WARNING,
    "",
    "Would clear spreadsheet ranges (header, formatting, filters and the",
    "spreadsheet itself are kept):",
    `  - ${targets.runsClearRange}   all run rows`,
    `  - ${targets.dashboardClearRange}   dashboard data + formulas`,
    "",
    "Would delete local generated files:",
    ...targets.local.map((entry) => `  - [${entry.label}] ${entry.target}`),
    "",
    "Would preserve untouched:",
    ...targets.preserved.map((entry) => `  - ${entry}`),
    "",
    "Nothing has been changed. Re-run with --confirm to proceed:",
    "  npm run reset -- --confirm",
  ].join("\n");
  return { targets, text };
};

/**
 * Performs the reset. Callers must have printed `describeReset` and obtained
 * an explicit `--confirm` first.
 */
export const performReset = async ({ config, backend, logger = console }) => {
  const targets = resetTargets({ config });
  const clearedRanges = [];

  // 1. Spreadsheet first: if this fails we have not deleted anything local.
  await backend.clearRange(targets.runsClearRange);
  clearedRanges.push(targets.runsClearRange);
  await backend.clearRange(targets.dashboardClearRange);
  clearedRanges.push(targets.dashboardClearRange);

  // 2. Restore header, formatting, validation and the dashboard grid.
  await initializeSheets({ backend, config, logger });

  // 3. Local generated state (allow-listed paths only, never .env*).
  const removed = [];
  for (const entry of targets.local) {
    await rm(entry.target, { recursive: true, force: true });
    removed.push(entry.target);
  }

  return { performed: true, clearedRanges, removed, targets };
};