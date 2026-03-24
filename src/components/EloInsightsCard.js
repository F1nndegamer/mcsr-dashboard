import React from 'react';

const formatSigned = (value) => {
  if (typeof value !== 'number') return 'N/A';
  return `${value > 0 ? '+' : ''}${value}`;
};

const formatDate = (value) => {
  if (typeof value !== 'number') return 'Unknown';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const EloInsightsCard = ({ data }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="glass-panel p-6">
        <h3 className="text-xs font-bold uppercase mb-2">Elo Insights</h3>
        <p className="text-sm text-gray-400">No all-time ranked Elo data to summarize yet.</p>
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const peak = data.reduce((best, point) => (point.elo > best.elo ? point : best), data[0]);
  const floor = data.reduce((lowest, point) => (point.elo < lowest.elo ? point : lowest), data[0]);

  const recentStartIndex = Math.max(0, data.length - 20);
  const recentDelta = last.elo - data[recentStartIndex].elo;
  const totalDelta = last.elo - first.elo;

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase mb-4">Elo Insights</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Current Elo</span>
          <span className="font-bold text-minecraft-green">{last.elo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">All-time Peak</span>
          <span className="font-bold text-minecraft-gold">{peak.elo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Peak Date</span>
          <span>{formatDate(peak.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">All-time Low</span>
          <span>{floor.elo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Lifetime Delta</span>
          <span className={totalDelta >= 0 ? 'text-minecraft-green' : 'text-red-300'}>{formatSigned(totalDelta)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Last 20 Matches</span>
          <span className={recentDelta >= 0 ? 'text-minecraft-green' : 'text-red-300'}>{formatSigned(recentDelta)}</span>
        </div>
      </div>
    </div>
  );
};

export default EloInsightsCard;
