import React, { useMemo } from "react";
import { getTimelineDataForPlayer } from "./timelineUtils";

const BUCKETS = [
  { key: "fastest", label: "Fastest", tone: "text-minecraft-green" },
  { key: "fast", label: "Fast", tone: "text-minecraft-green" },
  { key: "slow", label: "Slow", tone: "text-minecraft-gold" },
  { key: "slowest", label: "Slowest", tone: "text-red-300" },
];

// Cumulative milestones worth comparing: each is the split you must have hit.
const MILESTONES = [
  { key: "overworld", label: "Overworld" },
  { key: "nether", label: "Nether" },
  { key: "bastion", label: "Bastion" },
  { key: "fortress", label: "Fortress" },
  { key: "blind", label: "Blind" },
  { key: "stronghold", label: "Stronghold" },
  { key: "end", label: "The End" },
];

const formatDuration = (ms) => {
  if (typeof ms !== "number") return "—";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const average = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/**
 * Splits bucketed by how fast the run was finished. Comparing the Fastest
 * bucket against the Slowest one shows which milestone actually regressed:
 * if Nether is flat but Blind Travel blew up, the problem is not speedrunning.
 */
const SplitTrendCard = ({ matches = [], userUuid, isLoading = false, totalWindow = 50 }) => {
  const { groups, fastest, sampleSize } = useMemo(() => {
    const rows = matches
      .map((match) => {
        const timeline = getTimelineDataForPlayer(match, userUuid);

        if (!timeline || typeof timeline.finalTime !== "number") return null;

        return { id: match.id, timeline };
      })
      .filter(Boolean)
      .sort((a, b) => a.timeline.finalTime - b.timeline.finalTime);

    if (rows.length < 4) {
      return { groups: [], fastest: null, sampleSize: rows.length };
    }

    // Quartile buckets over the sorted-by-time runs.
    const size = rows.length / 4;
    const slices = [
      rows.slice(0, Math.round(size)),
      rows.slice(Math.round(size), Math.round(size * 2)),
      rows.slice(Math.round(size * 2), Math.round(size * 3)),
      rows.slice(Math.round(size * 3)),
    ];

    const built = slices
      .map((slice, index) => {
        if (!slice.length) return null;

        const phases = {};

        MILESTONES.forEach((milestone) => {
          phases[milestone.key] = average(
            slice
              .map((row) => row.timeline.phaseTimes[milestone.key])
              .filter((value) => typeof value === "number"),
          );
        });

        return {
          ...BUCKETS[index],
          count: slice.length,
          avgComplete: average(slice.map((row) => row.timeline.finalTime)),
          phases,
        };
      })
      .filter(Boolean);

    return { groups: built, fastest: built[0], sampleSize: rows.length };
  }, [matches, userUuid]);

  if (sampleSize === 0 && !isLoading) {
    return (
      <div className="glass-panel p-6 min-h-[190px]">
        <h3 className="text-xs font-bold uppercase mb-2">Split Regression</h3>
        <p className="text-sm text-gray-400">
          No match timelines loaded to compare yet.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 min-h-[190px]">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-xs font-bold uppercase">Split Regression</h3>
        <p className="text-[10px] uppercase text-gray-500">
          {sampleSize}/{totalWindow} loaded
        </p>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        Average milestone splits, fastest runs down to slowest. The gap against
        your fastest runs points at the phase that regressed.
      </p>

      {isLoading ? (
        <p className="text-[11px] text-gray-500">Loading match timelines...</p>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          Need at least four timed runs to compare splits.
        </p>
      ) : (
        <SplitTable groups={groups} fastest={fastest} />
      )}
    </div>
  );
};

const SplitTable = ({ groups, fastest }) => {
  const slowest = groups[groups.length - 1];

  const delta = (a, b) => {
    if (typeof a !== "number" || typeof b !== "number") return null;

    return b - a;
  };

  const renderDelta = (value) => {
    if (value == null) return "—";

    const sign = value > 0 ? "+" : value < 0 ? "-" : "";

    return `${sign}${formatDuration(Math.abs(value))}`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left font-normal pb-1">Split</th>
            {groups.map((group) => (
              <th key={group.key} className="text-right font-normal pb-1 px-2">
                <span className={group.tone}>{group.label}</span>
                <span className="block text-gray-600">{group.count} runs</span>
              </th>
            ))}
            <th className="text-right font-normal pb-1 pl-2 text-gray-500">
              &Delta; vs fastest
            </th>
          </tr>
        </thead>
        <tbody>
          {MILESTONES.map((milestone) => {
            const gap = delta(
              fastest?.phases[milestone.key],
              slowest?.phases[milestone.key],
            );

            return (
              <tr key={milestone.key} className="border-t border-white/5">
                <td className="text-gray-400 py-1">{milestone.label}</td>
                {groups.map((group) => (
                  <td
                    key={group.key}
                    className="text-right px-2 py-1 text-gray-200 tabular-nums"
                  >
                    {formatDuration(group.phases[milestone.key])}
                  </td>
                ))}
                <td
                  className={`text-right pl-2 py-1 tabular-nums ${
                    gap == null
                      ? "text-gray-600"
                      : gap > 30000
                        ? "text-red-300"
                        : "text-gray-400"
                  }`}
                >
                  {renderDelta(gap)}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-white/10">
            <td className="text-gray-300 py-1 font-semibold">Complete</td>
            {groups.map((group) => (
              <td
                key={group.key}
                className={`text-right px-2 py-1 font-semibold tabular-nums ${group.tone}`}
              >
                {formatDuration(group.avgComplete)}
              </td>
            ))}
            <td className="text-right pl-2 py-1 text-gray-400 tabular-nums">
              {renderDelta(delta(fastest?.avgComplete, slowest?.avgComplete))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default SplitTrendCard;