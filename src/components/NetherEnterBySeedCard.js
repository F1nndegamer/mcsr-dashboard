import React, { useMemo } from "react";
import { getTimelineDataForPlayer } from "./timelineUtils";

const formatDuration = (ms) => {
  if (typeof ms !== "number") return "N/A";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
};

const NetherEnterBySeedCard = ({
  matches = [],
  userUuid,
  totalWindow = 0,
  isLoading = false,
}) => {
  const grouped = useMemo(() => {
    const buckets = {};

    matches.forEach((match) => {
      // Only consider ranked matches
      if (!match || match.type !== 2) return;

      const timeline = getTimelineDataForPlayer(match, userUuid);
      const netherEnter = timeline?.phaseTimes?.nether;
      if (typeof netherEnter !== "number") return;

      const seedLabel =
        match.seed?.overworld || match.seedType || "Unknown Seed";
      if (!buckets[seedLabel]) {
        buckets[seedLabel] = { total: 0, count: 0 };
      }

      buckets[seedLabel].total += netherEnter;
      buckets[seedLabel].count += 1;
    });

    return Object.entries(buckets)
      .map(([seedType, stats]) => ({
        seedType,
        avgNether: Math.round(stats.total / stats.count),
        count: stats.count,
      }))
      .sort((a, b) => {
        if (b.count === a.count) return a.avgNether - b.avgNether;
        return b.count - a.count;
      });
  }, [matches, userUuid]);

  const totalSamples = grouped.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="glass-panel p-6 min-h-[190px]">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs font-bold uppercase">Nether Enter by Seed</h3>
        <p className="text-[10px] uppercase text-gray-500">
          {matches.length}/{totalWindow} loaded
        </p>
      </div>

      <p className="text-[11px] text-gray-500 mb-3">
        Average nether enter split grouped by seed type (ranked + private).
      </p>

      {isLoading ? (
        <p className="text-[11px] text-gray-500 mb-3">
          Loading match timelines...
        </p>
      ) : null}

      {grouped.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          No nether timeline data available yet.
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map((entry) => (
            <div
              key={entry.seedType}
              className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"
            >
              <div>
                <p className="text-xs font-semibold text-gray-100">
                  {entry.seedType}
                </p>
                <p className="text-[10px] text-gray-500">{entry.count} runs</p>
              </div>
              <p className="text-sm text-minecraft-gold font-semibold">
                {formatDuration(entry.avgNether)}
              </p>
            </div>
          ))}

          <p className="text-[10px] text-gray-500 pt-1">
            {totalSamples} total runs with nether split data
          </p>
        </div>
      )}
    </div>
  );
};

export default NetherEnterBySeedCard;
