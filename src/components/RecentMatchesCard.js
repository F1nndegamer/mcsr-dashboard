import React from 'react';

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return 'N/A';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const getMatchResult = (match, userUuid) => {
  if (match.forfeited) return { label: 'FORFEIT', color: 'text-red-400' };
  if (!match.result?.uuid) return { label: 'DRAW', color: 'text-yellow-300' };
  if (match.result.uuid === userUuid) return { label: 'WIN', color: 'text-minecraft-green' };
  return { label: 'LOSS', color: 'text-orange-300' };
};

const RecentMatchesCard = ({ matches, userUuid }) => (
  <div className="glass-panel p-6 overflow-hidden">
    <h3 className="text-xs font-bold uppercase mb-4">Recent Matches</h3>
    {matches.length === 0 ? (
      <p className="text-sm text-gray-400">No recent matches found.</p>
    ) : (
      <div className="space-y-4">
        {matches.slice(0, 5).map((match) => {
          const result = getMatchResult(match, userUuid);
          const seedLabel = match.seed?.overworld || match.seedType || 'Unknown Seed';

          return (
            <div key={match.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2">
              <div>
                <p className="font-bold">{seedLabel}</p>
                <p className="text-xs text-gray-500">Season {match.season}</p>
              </div>
              <div className="text-right">
                <p className={result.color}>{result.label}</p>
                <p className="text-[10px] text-gray-500">{formatDuration(match.result?.time)}</p>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default RecentMatchesCard;
