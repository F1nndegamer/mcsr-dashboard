import { DEFAULT_USER } from "../api/mcsrApi";

/**
 * Top-level, non-API configuration for the OBS stream stats overlay.
 * Edit these values directly, or override them per Browser Source via URL:
 *   ?overlay=1&title=MY%20CHALLENGE&goal=1000&user=F1nndegamer&poll=20
 *
 * The run counter is auto-set from the tracker spreadsheet: the overlay polls
 * `totalRunsEndpoint` (the /api/total-runs serverless function), which reads the
 * Dashboard's "Completed Runs / 1000" cell with the Google credentials kept
 * server-side. Use ?counter=<url> to point at a different endpoint, or ?total=123
 * to pin a manual number instead (which stays adjustable with the ↑/↓ hotkeys).
 */
export const OVERLAY_CONFIG = {
  title: "1000 SPEEDRUNS CHALLENGE",
  username: DEFAULT_USER,
  // Fallback counter shown before /api/total-runs answers for the first time.
  // Once the endpoint responds it always wins (see StreamStatsOverlay).
  totalSpeedruns: 0,
  goalRuns: 1000,
  // Poll every 20s (spec range: 15-30s) so OBS updates without page reloads.
  pollIntervalMs: 20000,
  // null => "today" starts at UTC midnight (matches DailyProgressCard).
  sessionStartEpochSeconds: null,
  // Where the run counter is read from. Relative by default so it follows the
  // deployment; ?counter= overrides it (used by tests / remote deployments).
  totalRunsEndpoint: "/api/total-runs",
};

const parseNonNegativeInt = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export const resolveOverlayConfig = (search = window.location.search) => {
  const params = new URLSearchParams(search);

  const title = params.get("title");
  const user = params.get("user");
  const total = parseNonNegativeInt(params.get("total"));
  const goal = parseNonNegativeInt(params.get("goal"));
  const pollSeconds = parseNonNegativeInt(params.get("poll"));
  const session = parseNonNegativeInt(params.get("session"));
  const showControls = params.get("controls") === "1";
  const counter = params.get("counter");
  // ?total=0 is the default, so treat "set but zero" as an explicit manual pin:
  // an operator using it wants a hardcoded number, not the spreadsheet.
  const hasManualTotal = params.has("total");
  const hasManualGoal = params.has("goal");

  return {
    title: title || OVERLAY_CONFIG.title,
    username: user || OVERLAY_CONFIG.username,
    totalSpeedruns: total ?? OVERLAY_CONFIG.totalSpeedruns,
    hasManualTotal,
    goalRuns: goal ?? OVERLAY_CONFIG.goalRuns,
    hasManualGoal,
    pollIntervalMs: pollSeconds
      ? pollSeconds * 1000
      : OVERLAY_CONFIG.pollIntervalMs,
    sessionStartEpochSeconds:
      session ?? OVERLAY_CONFIG.sessionStartEpochSeconds,
    totalRunsEndpoint: counter || OVERLAY_CONFIG.totalRunsEndpoint,
    showControls,
  };
};

export const TOTAL_RUNS_STORAGE_KEY = "mcsr-overlay:total-speedruns";

/**
 * Local hotkey/button edits of the runs counter, persisted so they survive
 * OBS source reloads. An edit only applies while the base it was made against
 * is unchanged; when the spreadsheet reports a new total the base changes, the
 * new value is adopted and the stale edit is discarded.
 */
export const loadStoredTotalRuns = (base) => {
  try {
    const raw = window.localStorage.getItem(TOTAL_RUNS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (parsed?.base !== base) return null;

    const value = Math.floor(Number(parsed.value));
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
};

export const saveStoredTotalRuns = (value, base) => {
  try {
    window.localStorage.setItem(
      TOTAL_RUNS_STORAGE_KEY,
      JSON.stringify({ value, base }),
    );
  } catch {
    // Storage unavailable (private mode / blocked) — hotkeys still work in-session.
  }
};

export const clearStoredTotalRuns = () => {
  try {
    window.localStorage.removeItem(TOTAL_RUNS_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

/**
 * Fetches the authoritative run counter from the serverless endpoint.
 * Throws on any problem so the caller can keep its last known value - the
 * overlay must never blank the counter because one poll failed.
 */
export const fetchSpreadsheetTotalRuns = async (endpoint, { signal } = {}) => {
  const response = await fetch(endpoint, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Total-runs endpoint responded ${response.status}.`);
  }

  const payload = await response.json();
  const totalRuns = Number(payload?.totalRuns);

  if (!Number.isFinite(totalRuns) || totalRuns < 0) {
    throw new Error("Total-runs endpoint returned an invalid totalRuns.");
  }

  // The goal comes from the same Dashboard label ("... / 1000"), but a null or
  // missing value means "keep the configured goal" rather than "error".
  const goal = Number(payload?.goalRuns);

  return {
    totalRuns: Math.floor(totalRuns),
    goalRuns: Number.isFinite(goal) && goal > 0 ? Math.floor(goal) : null,
    updatedAt: payload?.updatedAt ?? null,
  };
};
