/**
 * Domain constants for the 1000-run tracker.
 *
 * The four user-facing result values are deliberately the only ones the
 * spreadsheet ever sees. Forfeits are surfaced as FORFEIT even when the API
 * credits the tracked player with the win, because a forfeit is not a run.
 */

/** @typedef {"WIN" | "LOSS" | "DRAW" | "FORFEIT"} RunResult */

export const RUN_RESULTS = Object.freeze(["WIN", "LOSS", "DRAW", "FORFEIT"]);

export const RESULT = Object.freeze({
  WIN: "WIN",
  LOSS: "LOSS",
  DRAW: "DRAW",
  FORFEIT: "FORFEIT",
});

export const TARGET_RUNS = 1000;

export const DATA_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  NEEDS_INPUT: "NEEDS INPUT",
});

export const RUNS_SHEET = "Runs";
export const DASHBOARD_SHEET = "Dashboard";

/**
 * The "Stream" link block written directly below the last run row of the
 * Runs sheet (and surfaced as a segment on the Dashboard).
 *
 * Layout: column A holds the row label, column B the URL -
 *   [Stream] [                    ]   <- block heading (also the marker that
 *   [Twitch] [https://twitch.tv/..]      readRunsSheet uses to keep the block
 *   [YouTube] [https://www.../@..]     out of the record rows)
 *   [Latest VOD] [https://www.youtube.com/watch?v=..]  (auto-looked-up)
 *
 * Column B is deliberately outside every column the Dashboard aggregates over
 * (Match ID / Result / Final Time / Data Status), so the block can never skew
 * a stat. The label constants are shared with the Dashboard's INDEX/MATCH
 * formulas so the two can never drift apart.
 */
export const STREAM_BLOCK_LABEL = "Stream";

export const STREAM_LINK_LABELS = Object.freeze({
  twitch: "Twitch",
  youtube: "YouTube",
  vod: "Latest VOD",
});

/**
 * Display placeholder for a value that is genuinely not applicable, as opposed
 * to one that is merely unknown or not yet filled in.
 *
 * Used for splits a run never reached (a LOSS has no End Split) and for the
 * Death Messages of a deathless run. It is a *display* convention applied when
 * serialising a row: the underlying record keeps `undefined` so the sync
 * engine, Data Status and the dashboard's numeric aggregates (AVERAGE / MIN /
 * MEDIAN / COUNT over the Final Time column) still only ever see real numbers.
 */
export const NOT_APPLICABLE = "N/A";

/**
 * Manual fields are user-owned and must never be overwritten by sync.
 * (`deaths` is API-seeded first - see API_SEEDED_FIELDS - then becomes
 * user-owned like the rest.)
 */
export const MANUAL_FIELDS = Object.freeze([
  "completionType",
  "deaths",
  "deathMessages",
  "notes",
]);

/**
 * Fields seeded from the API on first import, then user-owned.
 * Deaths is auto-counted from `projectelo.timeline.death` entries; when the
 * sheet already has a value (user confirmed or corrected it), sync keeps the
 * sheet value and never overwrites it with the API count.
 */
export const API_SEEDED_FIELDS = Object.freeze(["deaths"]);

/**
 * Completion Type is manually entered as -1 / 0 / 1.
 * This table is the single source of truth for both the JS helper and the
 * generated Google Sheets formula.
 */
export const COMPLETION_TYPES = Object.freeze([
  { value: -1, label: "One-shot" },
  { value: 0, label: "Zero-cycle" },
  { value: 1, label: "One-cycle" },
]);

export const INVALID_COMPLETION_LABEL = "Invalid";

export const COMPLETION_FORMULA_TEMPLATE = (column, row) =>
  `=IF(OR(ISBLANK(${column}${row}),${column}${row}=""),"",` +
  `IF(OR(${column}${row}=-1,${column}${row}="-1"),"One-shot",` +
  `IF(OR(${column}${row}=0,${column}${row}="0"),"Zero-cycle",` +
  `IF(OR(${column}${row}=1,${column}${row}="1"),"One-cycle","${INVALID_COMPLETION_LABEL}"))))`;
