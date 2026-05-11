import React from 'react';
import { TIMELINE_PHASES, averageTimelines } from './timelineUtils';

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return 'N/A';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const TimelinePhaseTable = ({ phaseTimes }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] text-gray-300">
    {TIMELINE_PHASES.map((phase) => (
      <div key={phase.key} className="flex justify-between gap-3 border-b border-white/5 py-1">
        <span className="text-gray-500">{phase.shortLabel}</span>
        <span className="text-gray-200">{formatDuration(phaseTimes?.[phase.key])}</span>
      </div>
    ))}
  </div>
);

const AverageTimelinesCard = ({ timelineRows = [], isLoading = false, totalWindow = 50 }) => {
  const selfAverages = averageTimelines(timelineRows, 'self');

  return (
    <div className="glass-panel p-6 min-h-[190px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold uppercase">Average Timelines</h3>
        <p className="text-[10px] uppercase text-gray-500">{timelineRows.length}/{totalWindow} loaded</p>
      </div>
      <p className="text-[11px] text-gray-500 mb-3">Your split averages across your latest 50 matches (no opponent).</p>

      {isLoading ? <p className="text-[11px] text-gray-500 mb-3">Loading recent match timelines...</p> : null}

      <div className="space-y-3">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-xs font-semibold text-gray-100 mb-2">Your Average Splits</p>
          <TimelinePhaseTable phaseTimes={selfAverages} />
        </div>
      </div>
    </div>
  );
};

export default AverageTimelinesCard;
