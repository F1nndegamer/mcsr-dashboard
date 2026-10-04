import React, { useMemo } from "react";
import {
  buildRankedTimeline,
  formatPercent,
  formatShortDate,
  formatSigned,
  summarize,
} from "./matchStatsUtils";

const VolatilityCard = ({ rankedMatches, userUuid }) => {
  const stats = useMemo(() => {
    const timeline = buildRankedTimeline(rankedMatches, userUuid).filter(
      (entry) => typeof entry.eloChange === "number",
    );

    if (!timeline.length) {
      return {
        total: 0,
        wins: [],
        losses: [],
        biggestUp: null,
        biggestDown: null,
        volatility: null,
        winAvg: null,
        lossAvg: null,
        bounceRate: null,
        bounceSample: 0,
        averageAbsSwing: null,
      };
    }

    const wins = timeline.filter((entry) => entry.eloChange > 0);
    const losses = timeline.filter((entry) => entry.eloChange < 0);
    const changes = timeline.map((entry) => entry.eloChange);

    const avg = changes.reduce((sum, value) => sum + value, 0) / changes.length;
    const variance =
      changes.reduce((sum, value) => sum + (value - avg) ** 2, 0) / changes.length;

    const biggestUp = timeline.reduce((best, entry) =>
      entry.eloChange > best.eloChange ? entry : best,
    );
    const biggestDown = timeline.reduce((worst, entry) =>
      entry.eloChange < worst.eloChange ? entry : worst,
    );

    // A bounce is a win played directly after a loss.
    let bounceSample = 0;
    let bounces = 0;

    for (let index = 1; index < timeline.length; index += 1) {
      if (timeline[index - 1].outcome !== "loss") continue;
      bounceSample += 1;
      if (timeline[index].outcome === "win") bounces += 1;
    }

    const winSummary = summarize(wins.map((entry) => entry.eloChange));
    const lossSummary = summarize(losses.map((entry) => Math.abs(entry.eloChange)));

    return {
      total: timeline.length,
      biggestUp,
      biggestDown,
      volatility: Math.sqrt(variance),
      winAvg: winSummary.avg,
      lossAvg: lossSummary.avg,
      bounceRate: bounceSample ? (bounces / bounceSample) * 100 : null,
      bounceSample,
      averageAbsSwing: summarize(changes.map(Math.abs)).avg,
    };
  }, [rankedMatches, userUuid]);

  const rows = [
    {
      label: "Average Win",
      value: stats.winAvg == null ? "N/A" : `+${Math.round(stats.winAvg)}`,
      color: "text-minecraft-green",
    },
    {
      label: "Average Loss",
      value: stats.lossAvg == null ? "N/A" : `-${Math.round(stats.lossAvg)}`,
      color: "text-red-300",
    },
    {
      label: "Volatility (σ)",
      value: stats.volatility == null ? "N/A" : stats.volatility.toFixed(1),
      color: "text-minecraft-gold",
    },
    {
      label: "Bounce Back Rate",
      value:
        stats.bounceRate == null
          ? "N/A"
          : `${formatPercent(stats.bounceRate)} (${stats.bounceSample})`,
      color:
        stats.bounceRate == null
          ? "text-gray-300"
          : stats.bounceRate >= 50
            ? "text-minecraft-green"
            : "text-red-300",
    },
  ];

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-1">
        Elo Volatility
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        How violently your rated swings behave
      </p>

      {stats.total === 0 ? (
        <p className="text-xs text-gray-400">No rated matches with Elo data yet.</p>
      ) : (
        <>
          <div className="space-y-1.5 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-3">
                <span className="text-gray-400">{row.label}</span>
                <span className={`font-semibold ${row.color}`}>{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-700 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-white/5 px-2 py-3">
              <p className="text-[10px] uppercase text-gray-500">Biggest Climb</p>
              <p className="text-lg font-bold text-minecraft-green">
                {formatSigned(stats.biggestUp.eloChange)}
              </p>
              <p className="text-[10px] text-gray-500">
                #{stats.biggestUp.id} • {formatShortDate(stats.biggestUp.startMs)}
              </p>
            </div>
            <div className="rounded-lg bg-white/5 px-2 py-3">
              <p className="text-[10px] uppercase text-gray-500">Biggest Crash</p>
              <p className="text-lg font-bold text-red-300">
                {formatSigned(stats.biggestDown.eloChange)}
              </p>
              <p className="text-[10px] text-gray-500">
                #{stats.biggestDown.id} • {formatShortDate(stats.biggestDown.startMs)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VolatilityCard;