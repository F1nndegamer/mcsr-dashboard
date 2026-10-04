import React, { useMemo } from "react";
import {
  buildRankedTimeline,
  UTC_HOUR_LABELS,
  WEEKDAY_LABELS,
} from "./matchStatsUtils";

const cellStyle = (ratio) => {
  if (!ratio) return "bg-white/5";

  const intensity = Math.min(1, ratio);
  const alpha = 0.15 + intensity * 0.75;

  return `rgba(255, 170, 0, ${alpha.toFixed(2)})`;
};

const RhythmCard = ({ rankedMatches, userUuid }) => {
  const { grid, peakCell, total, activeDays, winRateByHourBucket } = useMemo(() => {
    const entries = buildRankedTimeline(rankedMatches, userUuid);
    const buckets = Array.from({ length: 7 }, () => Array(24).fill(0));
    const hourBuckets = [
      { label: "00-06", wins: 0, decided: 0 },
      { label: "06-12", wins: 0, decided: 0 },
      { label: "12-18", wins: 0, decided: 0 },
      { label: "18-24", wins: 0, decided: 0 },
    ];
    let busiest = null;

    entries.forEach((entry) => {
      const date = new Date(entry.startMs);
      const weekday = date.getUTCDay();
      const hour = date.getUTCHours();

      buckets[weekday][hour] += 1;

      if (
        !busiest ||
        buckets[weekday][hour] > busiest.count ||
        // Tie-break on the most recent match so the "peak" stays current.
        (buckets[weekday][hour] === busiest.count && entry.startMs > busiest.startMs)
      ) {
        busiest = { weekday, hour, count: buckets[weekday][hour], startMs: entry.startMs };
      }

      const bucketIndex = Math.min(3, Math.floor(hour / 6));

      if (entry.outcome === "win" || entry.outcome === "loss") {
        hourBuckets[bucketIndex].decided += 1;
        if (entry.outcome === "win") hourBuckets[bucketIndex].wins += 1;
      }
    });

    return {
      grid: buckets,
      peakCell: busiest,
      total: entries.length,
      activeDays: new Set(entries.map((entry) => Math.floor(entry.startMs / 86400000))).size,
      winRateByHourBucket: hourBuckets.map((bucket) => ({
        ...bucket,
        winRate: bucket.decided
          ? (bucket.wins / bucket.decided) * 100
          : null,
      })),
    };
  }, [rankedMatches, userUuid]);

  const maxCount = grid.reduce(
    (max, row) => Math.max(max, ...row),
    0,
  );

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-1">
        Grind Rhythm
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        When you queue, by UTC weekday and hour
      </p>

      {total === 0 ? (
        <p className="text-xs text-gray-400">No ranked matches to plot yet.</p>
      ) : (
        <>
          <div className="space-y-1">
            {grid.map((row, weekday) => (
              <div key={WEEKDAY_LABELS[weekday]} className="flex items-center gap-1.5">
                <span className="w-7 text-[10px] text-gray-500">
                  {WEEKDAY_LABELS[weekday]}
                </span>
                <div className="grid grid-cols-24 gap-0.5 flex-1">
                  {row.map((count, hour) => (
                    <span
                      key={hour}
                      title={`${WEEKDAY_LABELS[weekday]} ${UTC_HOUR_LABELS[hour]} UTC - ${count} matches`}
                      className={`h-2.5 rounded-[2px] ${cellStyle(maxCount ? count / maxCount : 0)}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between pl-8 text-[9px] text-gray-600">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>23:00</span>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-700 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-400">Peak grind window</span>
              <span className="font-semibold text-minecraft-gold">
                {peakCell
                  ? `${WEEKDAY_LABELS[peakCell.weekday]} ${UTC_HOUR_LABELS[peakCell.hour]}`
                  : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Active days</span>
              <span className="text-gray-100">{activeDays}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-4 gap-2 text-center">
            {winRateByHourBucket.map((bucket) => (
              <div key={bucket.label}>
                <p className="text-[9px] text-gray-500 uppercase">{bucket.label}</p>
                <p
                  className={`text-sm font-bold ${
                    bucket.winRate == null
                      ? "text-gray-500"
                      : bucket.winRate >= 50
                        ? "text-minecraft-green"
                        : "text-red-300"
                  }`}
                >
                  {bucket.winRate == null ? "-" : `${Math.round(bucket.winRate)}%`}
                </p>
                <p className="text-[9px] text-gray-600">{bucket.decided} games</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default RhythmCard;