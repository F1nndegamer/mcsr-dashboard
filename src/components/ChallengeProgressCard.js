import React, { useEffect, useMemo, useState } from "react";
import { fetchSpreadsheetTotalRuns } from "../overlay/overlayConfig";
import { buildRankedTimeline } from "./matchStatsUtils";
import { formatClock } from "../overlay/overlayStats";

export const CHALLENGE_GOAL = 1000;

const WINDOW_SIZES = [10, 25, 50];

/** Runs per day implied by the most recent `window` matches. */
const projectPace = (timeline, windowSize, goal, current) => {
  const recent = timeline.slice(-windowSize);

  if (recent.length < 2) return null;

  const elapsedMs = recent[recent.length - 1].startMs - recent[0].startMs;

  if (!(elapsedMs > 0)) return null;

  const runsPerDay = (recent.length - 1) / (elapsedMs / 86400000);

  if (!(runsPerDay > 0)) return null;

  return {
    runsPerDay,
    daysLeft: Math.max(0, goal - current) / runsPerDay,
  };
};

const formatTargetDate = (daysLeft) =>
  new Date(Date.now() + daysLeft * 86400000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const ChallengeProgressCard = ({
  rankedMatches,
  userUuid,
  endpoint = "/api/total-runs",
  goal = CHALLENGE_GOAL,
}) => {
  const [windowSize, setWindowSize] = useState(25);
  const [remote, setRemote] = useState({ total: null, goal: null, state: "loading" });

  // The tracker spreadsheet is authoritative when the endpoint is deployed;
  // locally (CRA dev server) it 404s, so fall back to the API history count.
  useEffect(() => {
    let cancelled = false;

    fetchSpreadsheetTotalRuns(endpoint)
      .then((payload) => {
        if (cancelled) return;
        setRemote({ total: payload.totalRuns, goal: payload.goalRuns, state: "ready" });
      })
      .catch(() => {
        if (!cancelled) setRemote({ total: null, goal: null, state: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const timeline = useMemo(
    () => buildRankedTimeline(rankedMatches, userUuid),
    [rankedMatches, userUuid],
  );

  const target = remote.goal || goal;
  const current = remote.total ?? timeline.length;
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const projection = projectPace(timeline, windowSize, target, current);
  const windowTimeMs = timeline
    .slice(-windowSize)
    .reduce((sum, entry) => sum + (entry.durationMs || 0), 0);
  const source =
    remote.state === "ready"
      ? "tracker spreadsheet"
      : remote.state === "loading"
        ? "loading"
        : "API match history";

  return (
    <div className="glass-panel p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xs font-bold uppercase text-minecraft-gold">
            1000 Run Challenge
          </h3>
          <p className="text-[11px] text-gray-500 mt-1">Source: {source}</p>
        </div>
        <p className="text-3xl font-bold text-gray-100 tabular-nums">
          {percent.toFixed(1)}
          <span className="text-lg text-gray-500">%</span>
        </p>
      </div>

      <div
        className="h-3 w-full rounded-full bg-white/5 overflow-hidden border border-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={current}
        aria-label="Challenge progress"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-minecraft-gold to-minecraft-green transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-[11px] text-gray-500">
        <span className="font-semibold text-gray-200">
          {current.toLocaleString()} / {target.toLocaleString()}
        </span>
        <span>{remaining.toLocaleString()} to go</span>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400">Pace projection</p>
          <div className="flex gap-1">
            {WINDOW_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setWindowSize(size)}
                className={`text-[10px] px-2 py-0.5 rounded border transition ${
                  windowSize === size
                    ? "border-minecraft-gold/70 text-minecraft-gold bg-minecraft-gold/10"
                    : "border-white/15 text-gray-400 hover:bg-white/5"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {projection ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Runs per day</span>
              <span className="font-semibold text-minecraft-gold">
                {projection.runsPerDay.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Projected finish</span>
              <span className="font-semibold text-gray-100">
                {Math.ceil(projection.daysLeft)} days
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Target date</span>
              <span className="text-gray-100">{formatTargetDate(projection.daysLeft)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Time to burn</span>
              <span className="text-gray-100">{formatClock(windowTimeMs)}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">
            Need at least two timed matches to project a pace.
          </p>
        )}
      </div>
    </div>
  );
};

export default ChallengeProgressCard;