import { DEFAULT_USER } from "../api/mcsrApi";

/**
 * Top-level, non-API configuration for the OBS stream stats overlay.
 * Edit these values directly, or override them per Browser Source via URL:
 *   ?overlay=1&title=MY%20CHALLENGE&total=985&goal=1000&user=F1nndegamer&poll=20
 */
export const OVERLAY_CONFIG = {
  title: "SPEEDRUN 1000 CHALLENGE",
  username: DEFAULT_USER,
  // Local (non-API) challenge counter shown in the header/progress bar.
  totalSpeedruns: 985,
  goalRuns: 1000,
  // Poll every 20s (spec range: 15-30s) so OBS updates without page reloads.
  pollIntervalMs: 20000,
  // null => "today" starts at UTC midnight (matches DailyProgressCard).
  sessionStartEpochSeconds: null,
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

  return {
    title: title || OVERLAY_CONFIG.title,
    username: user || OVERLAY_CONFIG.username,
    totalSpeedruns: total ?? OVERLAY_CONFIG.totalSpeedruns,
    goalRuns: goal ?? OVERLAY_CONFIG.goalRuns,
    pollIntervalMs: pollSeconds
      ? pollSeconds * 1000
      : OVERLAY_CONFIG.pollIntervalMs,
    sessionStartEpochSeconds:
      session ?? OVERLAY_CONFIG.sessionStartEpochSeconds,
  };
};
