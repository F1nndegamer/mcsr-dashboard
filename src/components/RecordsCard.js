import React, { useMemo } from "react";
import {
  buildRankedTimeline,
  formatSigned,
} from "./matchStatsUtils";
import { formatClock } from "../overlay/overlayStats";

const DAY_MS = 86400000;

const dayKey = (ms) => Math.floor(ms / DAY_MS);

/** All-time extremes built from the annotated ranked timeline. */
const RecordsCard = ({ rankedMatches, userUuid }) => {
  const records = useMemo(() => {
    const timeline = buildRankedTimeline(rankedMatches, userUuid);

    if (timeline.length === 0) {
      return { total: 0, records: [] };
    }

    // Group by UTC day for the daily records.
    const days = new Map();

    timeline.forEach((entry) => {
      const key = dayKey(entry.startMs);

      if (!days.has(key)) {
        days.set(key, {
          key,
          startMs: entry.startMs,
          endMs: entry.startMs,
          matches: 0,
          wins: 0,
          eloNet: 0,
          eloCounted: 0,
        });
      }

      const day = days.get(key);

      day.startMs = Math.min(day.startMs, entry.startMs);
      day.endMs = Math.max(day.endMs, entry.startMs);
      day.matches += 1;
      if (entry.outcome === "win") day.wins += 1;
      if (typeof entry.eloChange === "number") {
        day.eloNet += entry.eloChange;
        day.eloCounted += 1;
      }
    });

    const dayList = Array.from(days.values());

    const bestEloDay = dayList.reduce(
      (best, day) => (day.eloCounted && (!best || day.eloNet > best.eloNet) ? day : best),
      null,
    );
    const worstEloDay = dayList.reduce(
      (worst, day) =>
        day.eloCounted && (!worst || day.eloNet < worst.eloNet) ? day : worst,
      null,
    );
    const busiestDay = dayList.reduce(
      (best, day) => (!best || day.matches > best.matches ? day : best),
      null,
    );
    const longestSession = dayList.reduce(
      (best, day) =>
        !best || day.endMs - day.startMs > best.endMs - best.startMs ? day : best,
      null,
    );

    // Smallest gap between two consecutive ranked matches.
    let shortestGap = null;

    for (let index = 1; index < timeline.length; index += 1) {
      const gapMs = timeline[index].startMs - timeline[index - 1].startMs;

      if (gapMs <= 0) continue;
      if (shortestGap == null || gapMs < shortestGap.gapMs) {
        shortestGap = { gapMs, entry: timeline[index] };
      }
    }

    const fastestWin = timeline.reduce((best, entry) => {
      if (entry.outcome !== "win" || entry.durationMs == null) return best;

      return !best || entry.durationMs < best.durationMs ? entry : best;
    }, null);

    const rows = [];

    if (bestEloDay) {
      rows.push({
        label: "Best Elo day",
        value: formatSigned(bestEloDay.eloNet),
        detail: `${bestEloDay.matches} games`,
        color: "text-minecraft-green",
      });
    }

    if (worstEloDay && worstEloDay.key !== bestEloDay?.key) {
      rows.push({
        label: "Worst Elo day",
        value: formatSigned(worstEloDay.eloNet),
        detail: `${worstEloDay.matches} games`,
        color: "text-red-300",
      });
    }

    if (busiestDay) {
      rows.push({
        label: "Most games in a day",
        value: String(busiestDay.matches),
        detail: `${busiestDay.wins} wins`,
        color: "text-gray-100",
      });
    }

    if (longestSession) {
      rows.push({
        label: "Longest session",
        value: formatClock(longestSession.endMs - longestSession.startMs),
        detail: `${longestSession.matches} games`,
        color: "text-gray-100",
      });
    }

    if (shortestGap) {
      rows.push({
        label: "Fastest back-to-back",
        value: formatClock(shortestGap.gapMs),
        detail: `before match #${shortestGap.entry.id}`,
        color: "text-minecraft-gold",
      });
    }

    if (fastestWin) {
      rows.push({
        label: "Fastest win",
        value: formatClock(fastestWin.durationMs),
        detail: `match #${fastestWin.id}`,
        color: "text-minecraft-green",
      });
    }

    return { total: timeline.length, records: rows };
  }, [rankedMatches, userUuid]);

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-1">
        Records
      </h3>
      <p className="text-[11px] text-gray-500 mb-4">All-time extremes</p>

      {records.total === 0 ? (
        <p className="text-sm text-gray-400">No ranked matches to break yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {records.records.map((record) => (
            <div
              key={record.label}
              className="border-b border-white/5 pb-2 flex flex-col justify-between"
            >
              <p className="text-[10px] uppercase text-gray-500">{record.label}</p>
              <p className={`text-xl font-bold tabular-nums ${record.color}`}>
                {record.value}
              </p>
              <p className="text-[10px] text-gray-600">{record.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecordsCard;