import React, { useMemo } from "react";
import {
  buildRankedTimeline,
  formatPercent,
  getOpponentElo,
} from "./matchStatsUtils";

const BAND_WIDTH = 200;
const MIN_BAND_SIZE = 3;

const OpponentEloCard = ({ rankedMatches, userUuid }) => {
  const bands = useMemo(() => {
    const timeline = buildRankedTimeline(rankedMatches, userUuid);

    const buckets = new Map();

    timeline.forEach((entry) => {
      const opponentElo = getOpponentElo(entry.match, userUuid);

      if (opponentElo == null) return;
      if (entry.outcome !== "win" && entry.outcome !== "loss") return;

      // Bands are anchored to the floor so a 1974 opponent lands in "1800-2000".
      const lower = Math.floor(opponentElo / BAND_WIDTH) * BAND_WIDTH;
      const key = `${lower}-${lower + BAND_WIDTH}`;

      if (!buckets.has(key)) {
        buckets.set(key, { label: key, lower, wins: 0, decided: 0, eloSum: 0 });
      }

      const bucket = buckets.get(key);

      bucket.decided += 1;
      bucket.eloSum += opponentElo;
      if (entry.outcome === "win") bucket.wins += 1;
    });

    return Array.from(buckets.values())
      .map((bucket) => ({
        ...bucket,
        winRate: (bucket.wins / bucket.decided) * 100,
        avgOpponentElo: bucket.eloSum / bucket.decided,
      }))
      .sort((a, b) => a.lower - b.lower);
  }, [rankedMatches, userUuid]);

  const strongest = useMemo(() => {
    const eligible = bands.filter((band) => band.decided >= MIN_BAND_SIZE);

    if (!eligible.length) return null;

    return eligible.reduce((best, band) =>
      band.winRate > best.winRate ? band : best,
    );
  }, [bands]);

  if (bands.length === 0) {
    return (
      <div className="glass-panel p-6">
        <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-4">
          Who You Beat
        </h3>
        <p className="text-sm text-gray-400">
          No opponent Elo data available yet.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-1">
        Who You Beat
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">
        Win rate by opponent Elo band
      </p>

      <div className="space-y-2">
        {bands.map((band) => {
          const meaningful = band.decided >= MIN_BAND_SIZE;

          return (
            <div key={band.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-300">
                  {band.label}
                  <span className="text-gray-600 ml-1.5">
                    avg {Math.round(band.avgOpponentElo)}
                  </span>
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    !meaningful
                      ? "text-gray-500"
                      : band.winRate >= 50
                        ? "text-minecraft-green"
                        : "text-red-300"
                  }`}
                  title={`${band.wins}W / ${band.decided - band.wins}L`}
                >
                  {formatPercent(band.winRate)}
                  <span className="text-gray-600 ml-1 font-normal">
                    {band.decided}g
                  </span>
                </span>
              </div>
              <div className="h-2 rounded bg-white/5 overflow-hidden">
                <div
                  className={`h-full rounded transition-[width] duration-500 ${
                    band.winRate >= 50 ? "bg-minecraft-green/80" : "bg-red-400/80"
                  } ${meaningful ? "" : "opacity-40"}`}
                  style={{ width: `${Math.min(100, band.winRate)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-700 text-sm">
        {strongest ? (
          <div className="flex justify-between gap-3">
            <span className="text-gray-400">Best band</span>
            <span className="font-semibold text-minecraft-gold">
              {strongest.label} • {formatPercent(strongest.winRate)} over{" "}
              {strongest.decided} games
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-500">
            Need {MIN_BAND_SIZE}+ games in a band to call a favourite.
          </p>
        )}
        <p className="mt-1 text-[10px] text-gray-600">
          Faded bars have fewer than {MIN_BAND_SIZE} games.
        </p>
      </div>
    </div>
  );
};

export default OpponentEloCard;