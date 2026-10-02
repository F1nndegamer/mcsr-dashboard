/** UTC midnight of "today" in epoch seconds (same convention as DailyProgressCard). */
export const getUtcStartOfTodaySeconds = (nowMs = Date.now()) => {
  const now = new Date(nowMs);
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
  );
};

/** A match contributes to average time only when it has a real completion time. */
export const isValidDurationMatch = (match) =>
  Boolean(match) &&
  match.forfeited !== true &&
  typeof match?.result?.time === "number" &&
  match.result.time > 0;

export const average = (values) =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/** Formats a duration in ms as M:SS.mmm (matches PersonalBestCard convention). */
export const formatDuration = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(
    milliseconds,
  ).padStart(3, "0")}`;
};

export const formatEloDelta = (delta) =>
  delta > 0 ? `+${delta}` : String(delta);

/**
 * Derives the API-driven overlay metrics from the profile and the merged
 * match map (seeded with full ranked history + refreshed by each poll).
 */
export const computeOverlayStats = ({
  profile,
  matches,
  sessionStart,
  hasFullHistory,
}) => {
  const userUuid = profile?.uuid;
  const allMatches = Array.from(matches.values());

  const todayMatches = allMatches.filter(
    (match) => typeof match?.date === "number" && match.date >= sessionStart,
  );

  const todayDurations = todayMatches
    .filter(isValidDurationMatch)
    .map((match) => match.result.time);

  const overallDurations = allMatches
    .filter(isValidDurationMatch)
    .map((match) => match.result.time);

  const eloDeltaToday = todayMatches.reduce((sum, match) => {
    const change = (match.changes || []).find(
      (entry) => entry.uuid === userUuid,
    );
    return sum + (typeof change?.change === "number" ? change.change : 0);
  }, 0);

  return {
    currentElo: typeof profile?.eloRate === "number" ? profile.eloRate : null,
    runsToday: todayMatches.length,
    eloDeltaToday,
    todayAvgTime: average(todayDurations),
    // Only trust the overall average once the full history has loaded.
    overallAvgTime: hasFullHistory ? average(overallDurations) : null,
  };
};
