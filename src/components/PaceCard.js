import React, { useMemo } from "react";
import {
  buildRankedTimeline,
  formatClockDuration,
  formatHours,
  summarize,
} from "./matchStatsUtils";

const BUCKETS = [
  { label: "<10m", max: 600000 },
  { label: "10-15m", max: 900000 },
  { label: "15-20m", max: 1200000 },
  { label: "20-25m", max: 1500000 },
  { label: "25m+", max: Infinity },
];

const PaceCard = ({ rankedMatches, userUuid }) => {
  const stats = useMemo(() => {
    const timeline = buildRankedTimeline(rankedMatches, userUuid);
    const played = timeline.filter((entry) => entry.durationMs != null);
    const wins = played.filter((entry) => entry.outcome === "win");
    const losses = played.filter((entry) => entry.outcome === "loss");

    const allDurations = summarize(played.map((entry) => entry.durationMs));
    const winDurations = summarize(wins.map((entry) => entry.durationMs));
    const lossDurations = summarize(losses.map((entry) => entry.durationMs));

    const fastestWin = wins.reduce(
      (best, entry) =>
        best == null || entry.durationMs < best.durationMs ? entry : best,
      null,
    );

    const distribution = BUCKETS.map((bucket, index) => {
      const lower = index === 0 ? -Infinity : BUCKETS[index - 1].max;

      return {
        label: bucket.label,
        count: played.filter(
          (entry) => entry.durationMs > lower && entry.durationMs <= bucket.max,
        ).length,
      };
    });

    const maxCount = distribution.reduce((max, bucket) => Math.max(max, bucket.count), 0);

    return {
      matchCount: played.length,
      totalTimeMs: allDurations.total,
      medianMs: allDurations.median,
      winAvgMs: winDurations.avg,
      lossAvgMs: lossDurations.avg,
      fastestWin,
      distribution,
      maxCount,
      forfeits: timeline.filter((entry) => entry.forfeited).length,
    };
  }, [rankedMatches, userUuid]);

  const edge =
    stats.winAvgMs != null && stats.lossAvgMs != null
      ? stats.winAvgMs - stats.lossAvgMs
      : null;

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-1">
        Pace & Speed
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        How fast ranked games end for you
      </p>

      {stats.matchCount === 0 ? (
        <p className="text-xs text-gray-400">No timed ranked matches available yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Median Game</p>
              <p className="text-lg font-bold text-gray-100">
                {formatClockDuration(stats.medianMs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total Time Played</p>
              <p className="text-lg font-bold text-minecraft-gold">
                {formatHours(stats.totalTimeMs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Avg Win Time</p>
              <p className="text-sm font-semibold text-minecraft-green">
                {formatClockDuration(stats.winAvgMs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Avg Loss Time</p>
              <p className="text-sm font-semibold text-red-300">
                {formatClockDuration(stats.lossAvgMs)}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-700">
            <p className="text-xs text-gray-400 mb-2">Game Length Distribution</p>
            <div className="space-y-1">
              {stats.distribution.map((bucket) => (
                <div key={bucket.label} className="flex items-center gap-2">
                  <span className="w-14 text-[10px] text-gray-500">{bucket.label}</span>
                  <div className="flex-1 h-2 rounded bg-white/5 overflow-hidden">
                    <div
                      className="h-full bg-minecraft-gold/80"
                      style={{
                        width: `${stats.maxCount ? (bucket.count / stats.maxCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right text-[10px] text-gray-400">
                    {bucket.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-700 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Fastest Win</span>
              <span className="font-semibold text-minecraft-green">
                {stats.fastestWin ? formatClockDuration(stats.fastestWin.durationMs) : "N/A"}
              </span>
            </div>
            {edge != null && (
              <div className="flex justify-between gap-3">
                <span className="text-gray-400">Win Speed Edge</span>
                <span
                  className={`font-semibold ${edge >= 0 ? "text-minecraft-green" : "text-red-300"}`}
                >
                  {`${edge >= 0 ? "-" : "+"}${formatClockDuration(Math.abs(edge))}`}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-gray-400">Forfeits</span>
              <span className="text-gray-100">{stats.forfeits}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PaceCard;