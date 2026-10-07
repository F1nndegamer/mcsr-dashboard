import { DASHBOARD_SHEET, RUNS_SHEET } from "../models/constants.js";
import { LAST_COLUMN_LETTER, headerRow } from "../models/runRecord.js";
import { MemoryBackend } from "./backend.js";
import { dashboardBuild } from "./dashboard.js";
import { dashboardFormatRequests } from "./dashboardFormatting.js";
import { FileBackend } from "./fileBackend.js";
import { createTokenProvider } from "./googleAuth.js";
import { GoogleSheetsBackend } from "./googleSheets.js";
import { buildStreamBlockRows, headerMatches, planStreamBlock, readRunsSheet } from "./runSheet.js";
import { runsSheetSetupRequests } from "./schema.js";
import { resolveStreamLinks } from "../core/streamLinks.js";

/**
 * Creates the configured spreadsheet backend.
 * Google needs a spreadsheet id, unless `createSpreadsheet: true`.
 */
export const createBackend = async ({
  config,
  createSpreadsheet = false,
  logger = console,
  fetchImpl,
} = {}) => {
  if (config.backend === "memory") {
    return { backend: new MemoryBackend({ title: config.spreadsheetTitle }), spreadsheetId: null };
  }

  if (config.backend === "file") {
    const backend = new FileBackend({ dir: config.fileBackendDir });
    await backend.load();
    return { backend, spreadsheetId: null };
  }

  if (config.backend !== "google") {
    throw new Error(`Unknown MCSR_BACKEND "${config.backend}" (expected google | file | memory).`);
  }

  const tokenProvider = createTokenProvider({ google: config.google, fetchImpl });

  let spreadsheetId = config.spreadsheetId;
  if (!spreadsheetId) {
    if (!createSpreadsheet) {
      throw new Error(
        "SPREADSHEET_ID is empty. Run `npm run init-sheet` to create one, or set SPREADSHEET_ID.",
      );
    }
    const created = await GoogleSheetsBackend.createSpreadsheet({
      title: config.spreadsheetTitle,
      tokenProvider,
      fetchImpl,
    });
    spreadsheetId = created.spreadsheetId;
    logger.log?.(`Created spreadsheet: ${created.spreadsheetUrl ?? spreadsheetId}`);
  }

  return {
    backend: new GoogleSheetsBackend({ spreadsheetId, tokenProvider, fetchImpl, logger }),
    spreadsheetId,
  };
};

const fillTemplate = (grid, values) =>
  grid.map((row) =>
    row.map((cell) => {
      if (typeof cell !== "string") return cell;
      let out = cell;
      for (const [key, value] of Object.entries(values)) {
        out = out.split(`{${key}}`).join(value);
      }
      return out;
    }),
  );

/**
 * Creates the Runs + Dashboard sheets and applies headers, formats,
 * data validation and filters. Idempotent - safe to re-run.
 */
export const initializeSheets = async ({ backend, config, logger = console, fetchImpl }) => {
  await backend.ensureSheet(RUNS_SHEET);
  await backend.ensureSheet(DASHBOARD_SHEET);

  const metadata = await backend.getSheetMetadata();

  // --- headers -------------------------------------------------------------
  const existingHeader = await backend.readValues(`${RUNS_SHEET}!A1:${LAST_COLUMN_LETTER}1`);
  const current = existingHeader?.[0] ?? [];
  let headerWritten = false;
  if (!headerMatches(current)) {
    await backend.batchUpdateValues({
      valueInputOption: "RAW",
      updates: [{ range: `${RUNS_SHEET}!A1:${LAST_COLUMN_LETTER}1`, values: [headerRow()] }],
    });
    headerWritten = true;
  }

  // --- formatting, freeze, filter, completion-type validation --------------
  const runsSheet = metadata.find((sheet) => sheet.title === RUNS_SHEET);
  if (runsSheet) {
    await backend.batchUpdateSpreadsheet({
      requests: runsSheetSetupRequests({
        sheetId: runsSheet.sheetId,
        capacity: config.sheetRowCapacity,
        // Existing conditional-format rules are deleted first (by index) so
        // re-running init never accumulates duplicates. See schema.js.
        existingConditionalFormatRuleCount: runsSheet.conditionalFormatRuleCount ?? 0,
      }),
    });
  } else {
    logger.warn?.("Runs sheet metadata missing; skipped formatting/validation setup.");
  }

  // --- dashboard -----------------------------------------------------------
  const dashboardSheet = metadata.find((sheet) => sheet.title === DASHBOARD_SHEET);
  const dashboard = dashboardBuild({ capacity: config.sheetRowCapacity });

  const gridRows = fillTemplate(dashboard.grid, {
    player: config.player,
    startDate: config.startDateIso ?? "(not set)",
    lastSynced: "(not synced yet)",
  }).map((row) => {
    const padded = [...row];
    while (padded.length < 4) padded.push("");
    return padded;
  });

  await backend.batchUpdateValues({
    valueInputOption: "USER_ENTERED",
    updates: [{ range: `${DASHBOARD_SHEET}!A1:D${gridRows.length}`, values: gridRows }],
  });

  const chartRows = [];
  for (
    let row = dashboard.chartFirstRow;
    row < dashboard.chartFirstRow + dashboard.chartRowCapacity;
    row += 1
  ) {
    const first = row === dashboard.chartFirstRow;
    chartRows.push([
      first ? dashboard.chartColumns.runNumber : "",
      first ? dashboard.chartColumns.finalTime : "",
      dashboard.chartColumns.rollingAverage(row),
      dashboard.chartColumns.progressivePb(row),
    ]);
  }
  await backend.batchUpdateValues({
    valueInputOption: "USER_ENTERED",
    updates: [
      {
        range: `${DASHBOARD_SHEET}!A${dashboard.chartFirstRow}:D${
          dashboard.chartFirstRow + chartRows.length - 1
        }`,
        values: chartRows,
      },
    ],
  });

  // --- Runs sheet: Stream link block below the last run row ----------------
  // Positioned from the sheet's actual record count, so re-running init on a
  // populated sheet never clobbers data; a moved/shrunk old block is cleared
  // first. The VOD lookup is best-effort (null just drops that row).
  const { records: existingRecords, streamBlock } = await readRunsSheet({
    backend,
    capacity: config.sheetRowCapacity,
  });
  const streamLinks = await resolveStreamLinks({
    stream: config.stream,
    player: config.player,
    fetchImpl,
    logger,
  });
  const streamPlan = planStreamBlock({
    recordCount: existingRecords.length,
    previousBlock: streamBlock,
    rows: buildStreamBlockRows(streamLinks),
  });
  if (streamPlan.clear) {
    await backend.batchUpdateValues({ valueInputOption: "RAW", updates: [streamPlan.clear] });
  }
  if (streamPlan.write) {
    await backend.batchUpdateValues({ valueInputOption: "USER_ENTERED", updates: [streamPlan.write] });
  }

  // --- Dashboard: stream link segment (live formulas over the Runs block) --
  await backend.batchUpdateValues({
    valueInputOption: "USER_ENTERED",
    updates: [
      {
        range: `${DASHBOARD_SHEET}!A${dashboard.streamHeaderRow}:D${dashboard.streamValueRow}`,
        values: [dashboard.streamHeader, dashboard.streamValues],
        majorDimension: "ROWS",
      },
    ],
  });

  if (dashboardSheet) {
    await backend.batchUpdateSpreadsheet({
      requests: dashboardFormatRequests({ sheetId: dashboardSheet.sheetId, dashboard }),
    });
  }

  return { headerWritten, dashboard };
};

/**
 * Lightweight sync-time guard: make sure both sheets exist and the Runs header
 * is still the expected schema. Does not touch formatting or the Dashboard, so
 * a sync can never clobber dashboard edits.
 */
export const ensureSheets = async ({ backend, config, logger = console }) => {
  await backend.ensureSheet(RUNS_SHEET);
  await backend.ensureSheet(DASHBOARD_SHEET);

  const existingHeader = await backend.readValues(`${RUNS_SHEET}!A1:${LAST_COLUMN_LETTER}1`);
  if (!headerMatches(existingHeader?.[0] ?? [])) {
    logger.warn?.("Runs header missing or changed; rewriting the header row.");
    await backend.batchUpdateValues({
      valueInputOption: "RAW",
      updates: [{ range: `${RUNS_SHEET}!A1:${LAST_COLUMN_LETTER}1`, values: [headerRow()] }],
    });
    return { headerWritten: true };
  }
  return { headerWritten: false };
};

/** Updates the Dashboard's "Last synced" cell. Best effort - never fatal. */
export const updateLastSynced = async ({ backend, dashboard, value }) => {
  if (!dashboard) return false;
  const row = dashboard.grid.findIndex((gridRow) => gridRow[0] === "Last synced");
  if (row === -1) return false;
  await backend.batchUpdateValues({
    valueInputOption: "RAW",
    updates: [{ range: `${DASHBOARD_SHEET}!B${row + 1}`, values: [[value]] }],
  });
  return true;
};
