import React from 'react';

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return 'N/A';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const PersonalBestCard = ({ bestSeasonTime, bestAllTime, allTimeRank }) => (
  <div className="glass-panel p-8 text-center relative overflow-hidden">
    <div className="relative z-10">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Best Ranked Time</p>
      <h2 className="text-5xl md:text-6xl font-black text-minecraft-gold">{formatDuration(bestSeasonTime)}</h2>
      <div className="mt-3 text-sm text-gray-300 space-y-1">
        <p>All-time PB: {formatDuration(bestAllTime)}</p>
        <p>{allTimeRank ? `Best seen rank: #${allTimeRank}` : 'Best rank: not available yet'}</p>
      </div>
    </div>
  </div>
);

export default PersonalBestCard;
