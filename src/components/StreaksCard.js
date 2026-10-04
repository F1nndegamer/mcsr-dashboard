import React, { useMemo } from "react";
import { buildRankedTimeline, formatPercent } from "./matchStatsUtils";

const FORM_WINDOW = 24;

const OUTCOME_STYLES = {
  win: "bg-minecraft-green",
  loss: "bg-red-400",
  draw: "bg-blue-300",
  unknown: "bg-gray-600",
};

const computeStreaks = (timeline) => {
  let current = { type: "none", length: 0 };
  let bestWin = 0;
  let worstLoss = 0;
  let winRun = 0;
  let lossRun = 0;

  timeline.forEach(({ outcome }) => {
    if (outcome === "win") {
      winRun += 1;
      lossRun = 0;
      bestWin = Math.max(bestWin, winRun);
    } else if (outcome === "loss") {
      lossRun += 1;
      winRun = 0;
      worstLoss = Math.max(worstLoss, lossRun);
    } else {
      winRun = 0;
      lossRun = 0;
    }

    current =
      outcome === "draw" || outcome === "unknown"
        ? { type: "none", length: 0 }
        : { type: outcome, length: outcome === "win" ? winRun : lossRun };
  });

  return { current, bestWin, worstLoss };
};

const StreaksCard = ({ rankedMatches, userUuid }) => {
  const { timeline, current, bestWin, worstLoss, form, formWinRate } =
    useMemo(() => {
      const entries = buildRankedTimeline(rankedMatches, userUuid);
      const streaks = computeStreaks(entries);
      const recent = entries.slice(-FORM_WINDOW);
      const decided = recent.filter(
        (entry) => entry.outcome === "win" || entry.outcome === "loss",
      );
      const winRate = decided.length
        ? (decided.filter((entry) => entry.outcome === "win").length / decided.length) * 100
        : null;

      return { timeline: entries, ...streaks, form: recent, formWinRate: winRate };
    }, [rankedMatches, userUuid]);

  const currentLabel = current.type === "none" ? "No streak" : `${current.length} ${current.type === "win" ? "win" : "loss"}${current.length === 1 ? "" : "es"}`;
  const currentColor =
    current.type === "win"
      ? "text-minecraft-green"
      : current.type === "loss"
        ? "text-red-300"
        : "text-gray-400";

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-4">
        Streaks & Momentum
      </h3>

      <div className="mb-4 pb-4 border-b border-gray-700">
        <p className="text-xs text-gray-400 mb-1">Current Streak</p>
        <p className={`text-2xl font-bold ${currentColor}`}>{currentLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Best Win Streak</p>
          <p className="text-xl font-bold text-minecraft-green">{bestWin}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Worst Losing Run</p>
          <p className="text-xl font-bold text-red-300">{worstLoss}</p>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-400">Last {form.length || FORM_WINDOW} results</p>
          <p className="text-xs text-gray-400">
            {form.length ? `${formatPercent(formWinRate)} win rate` : "No data"}
          </p>
        </div>
        <div className="flex gap-0.5 flex-wrap">
          {form.length === 0 ? (
            <p className="text-xs text-gray-500">No ranked matches yet.</p>
          ) : (
            form.map((entry, index) => (
              <span
                key={`${entry.id ?? index}`}
                title={`Match ${entry.id} - ${entry.outcome}`}
                className={`w-2 h-5 rounded-sm ${OUTCOME_STYLES[entry.outcome]} opacity-90`}
              />
            ))
          )}
        </div>
        <p className="mt-2 text-[10px] text-gray-500">
          {timeline.length} ranked matches tracked all-time
        </p>
      </div>
    </div>
  );
};

export default StreaksCard;