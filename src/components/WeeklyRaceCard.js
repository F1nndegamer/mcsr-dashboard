import React from 'react';

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return 'N/A';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const WeeklyRaceCard = ({ weeklyRaces }) => {
  if (!weeklyRaces || weeklyRaces.length === 0) {
    return (
      <div className="glass-panel p-6">
        <h3 className="text-xs font-bold uppercase mb-4">Weekly Race</h3>
        <p className="text-sm text-gray-400">No weekly race history.</p>
      </div>
    );
  }

  const latest = [...weeklyRaces].sort((a, b) => b.id - a.id)[0];
  const best = [...weeklyRaces].sort((a, b) => a.time - b.time)[0];
  const podiums = weeklyRaces.filter((race) => race.rank <= 3).length;

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase mb-4">Weekly Race</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Latest Week</span>
          <span className="text-gray-100">#{latest.id} (#{latest.rank})</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Latest Time</span>
          <span className="text-gray-100">{formatDuration(latest.time)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Best Time</span>
          <span className="text-minecraft-green font-semibold">{formatDuration(best.time)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Podiums</span>
          <span className="text-minecraft-gold font-semibold">{podiums}</span>
        </div>
      </div>
    </div>
  );
};

export default WeeklyRaceCard;
