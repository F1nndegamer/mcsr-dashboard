import React from 'react';

const getSeasonRows = (data) => {
  const bySeason = data.reduce((accumulator, point) => {
    const seasonKey = point.season ?? 'Unknown';

    if (!accumulator[seasonKey]) {
      accumulator[seasonKey] = {
        season: seasonKey,
        peak: point.elo,
        last: point.elo,
        matches: 1,
      };
      return accumulator;
    }

    accumulator[seasonKey].peak = Math.max(accumulator[seasonKey].peak, point.elo);
    accumulator[seasonKey].last = point.elo;
    accumulator[seasonKey].matches += 1;

    return accumulator;
  }, {});

  return Object.values(bySeason).sort((a, b) => Number(b.season) - Number(a.season));
};

const SeasonPeaksCard = ({ data }) => {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="glass-panel p-6">
        <h3 className="text-xs font-bold uppercase mb-2">Season Peaks</h3>
        <p className="text-sm text-gray-400">No all-time season history available yet.</p>
      </div>
    );
  }

  const seasonRows = getSeasonRows(data).slice(0, 5);

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase mb-4">Season Peaks</h3>
      <div className="space-y-3">
        {seasonRows.map((season) => (
          <div key={season.season} className="text-sm border-b border-white/10 pb-2">
            <div className="flex justify-between">
              <span className="text-gray-300">Season {season.season}</span>
              <span className="text-minecraft-gold font-bold">{season.peak}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{season.matches} rated matches</span>
              <span>Closed at {season.last}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeasonPeaksCard;
