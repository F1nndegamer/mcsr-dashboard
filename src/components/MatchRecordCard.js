import React from 'react';

const MatchRecordCard = ({ wins, losses, played, season }) => {
  const winRate = played > 0 ? ((wins / played) * 100).toFixed(1) : '0.0';

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold text-minecraft-gold uppercase mb-4">Match Record (S{season})</h3>
      <div className="flex justify-between items-end">
        <div>
          <p className="text-3xl font-bold">{played}</p>
          <p className="text-xs text-gray-400">Played</p>
        </div>
        <div className="text-right">
          <p className="text-xl text-minecraft-green font-bold">
            {wins}W - {losses}L
          </p>
          <p className="text-xs text-gray-400">Win Rate: {winRate}%</p>
        </div>
      </div>
    </div>
  );
};

export default MatchRecordCard;
