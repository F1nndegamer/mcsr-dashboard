/**
 * Shared helpers for the ranked-match stat cards.
 *
 * All helpers are defensive: the ranked match history comes from an external
 * API, so any field can be missing.
 */

export const formatClockDuration = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "N/A";

  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor(ms % 1000);

  const clock = `${minutes}:${String(seconds).padStart(2, "0")}.${String(
    milliseconds,
  ).padStart(3, "0")}`;

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : clock;
};

export const formatHours = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "N/A";

  const hours = ms / 3600000;

  if (hours >= 100) return `${Math.round(hours)}h`;
  if (hours >= 10) return `${hours.toFixed(0)}h`;
  return `${hours.toFixed(1)}h`;
};

export const formatSigned = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";

  return `${value > 0 ? "+" : ""}${Math.round(value)}`;
};

export const formatPercent = (value, digits = 0) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";

  return `${value.toFixed(digits)}%`;
};

/** "win" | "loss" | "draw" | "unknown" for a single ranked match. */
export const getMatchOutcome = (match, userUuid) => {
  if (!match || !userUuid) return "unknown";
  if (match.result?.uuid === userUuid) return "win";
  if (match.result?.uuid) return "loss";

  return "draw";
};

export const getUserEloChange = (match, userUuid) => {
  const changes = match?.changes;

  if (!Array.isArray(changes) || !userUuid) return null;

  const change = changes.find((entry) => entry?.uuid === userUuid);

  return typeof change?.change === "number" ? change.change : null;
};

const matchStartMs = (match) =>
  typeof match?.date === "number" ? match.date * 1000 : null;

/**
 * Ranked matches ordered oldest -> newest, each annotated with the outcome,
 * Elo change, duration (ms) and start time. Matches without a usable start
 * time are dropped because every card here is time ordered.
 */
export const buildRankedTimeline = (rankedMatches, userUuid) => {
  if (!Array.isArray(rankedMatches)) return [];

  return rankedMatches
    .map((match) => ({
      match,
      id: match?.id ?? null,
      startMs: matchStartMs(match),
      outcome: getMatchOutcome(match, userUuid),
      eloChange: getUserEloChange(match, userUuid),
      durationMs: typeof match?.result?.time === "number" ? match.result.time : null,
      forfeited: Boolean(match?.forfeited),
    }))
    .filter((entry) => typeof entry.startMs === "number")
    .sort((a, b) => (a.startMs === b.startMs ? a.id - b.id : a.startMs - b.startMs));
};

const median = (values) => {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/** Average / median / min / max of a numeric list. */
export const summarize = (values) => {
  const numbers = values.filter((value) => typeof value === "number" && Number.isFinite(value));

  if (!numbers.length) {
    return { count: 0, avg: null, median: null, min: null, max: null, total: null };
  }

  const total = numbers.reduce((sum, value) => sum + value, 0);

  return {
    count: numbers.length,
    avg: total / numbers.length,
    median: median(numbers),
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    total,
  };
};

export const UTC_HOUR_LABELS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const formatShortDate = (ms) => {
  if (typeof ms !== "number") return "Unknown";

  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};