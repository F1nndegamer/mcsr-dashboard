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

/** Manual fields are user-owned and must never be overwritten by sync. */
export const MANUAL_FIELDS = Object.freeze([
  "bastionVariant",
  "blazeRods",
  "completionType",
  "deaths",
  "deathMessages",
  "notes",
]);

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
