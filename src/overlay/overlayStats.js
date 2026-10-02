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

/** Formats a duration in ms as M:SS (big-tile friendly, no noisy ms). */
export const formatClock = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const formatEloDelta = (delta) =>
  delta > 0 ? `+${delta}` : String(delta);

/**
 * Derives the API-driven overlay metrics from the profile and the merged
 * match map (seeded with full ranked history + refreshed by each poll).
 */
/** Cumulative ELO-change series for today, starting at the session baseline. */
export const buildTodayEloSeries = (todayMatches, userUuid) => {
  const sorted = [...todayMatches]
    .filter((match) => typeof match?.date === "number")
    .sort((a, b) =>
      a.date === b.date ? (a.id ?? 0) - (b.id ?? 0) : a.date - b.date,
    );

  let cumulative = 0;
  const series = [0];

  sorted.forEach((match) => {
    const change = (match.changes || []).find(
      (entry) => entry.uuid === userUuid,
    );
    if (typeof change?.change !== "number") return;
    cumulative += change.change;
    series.push(cumulative);
  });

  return series;
};

/** Season personal best, falling back to the all-time best. */
export const getPersonalBest = (profile) =>
  profile?.statistics?.season?.bestTime?.ranked ??
  profile?.statistics?.total?.bestTime?.ranked ??
  null;

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
    eloSeries: buildTodayEloSeries(todayMatches, userUuid),
    personalBest: getPersonalBest(profile),
  };
};
