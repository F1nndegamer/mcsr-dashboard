import React from 'react';

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number') return 'N/A';
  return new Date(seconds * 1000).toLocaleString();
};

const ActivityCard = ({ timestamp }) => (
  <div className="glass-panel p-6">
    <h3 className="text-xs font-bold uppercase mb-4">Activity</h3>
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p className="text-xs text-gray-400">First Online</p>
        <p className="text-gray-100">{formatTimestamp(timestamp?.firstOnline)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400">Last Online</p>
        <p className="text-gray-100">{formatTimestamp(timestamp?.lastOnline)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400">Last Ranked</p>
        <p className="text-gray-100">{formatTimestamp(timestamp?.lastRanked)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400">Next Decay</p>
        <p className="text-gray-100">{formatTimestamp(timestamp?.nextDecay)}</p>
      </div>
    </div>
  </div>
);

export default ActivityCard;
