import React from 'react';
import { Youtube, Twitch, MessageSquare, Link as LinkIcon } from 'lucide-react';

const CONNECTION_ICONS = {
  discord: MessageSquare,
  youtube: Youtube,
  twitch: Twitch,
};

const CONNECTION_COLORS = {
  discord: 'text-indigo-400',
  youtube: 'text-red-500',
  twitch: 'text-purple-400',
};

const ConnectionsCard = ({ connections }) => (
  <div className="glass-panel p-6">
    <h3 className="text-xs font-bold uppercase mb-4">Verified Connections</h3>
    {!connections || Object.keys(connections).length === 0 ? (
      <p className="text-sm text-gray-400">No public connected accounts.</p>
    ) : (
      <div className="space-y-3">
        {Object.entries(connections).map(([key, value]) => {
          const Icon = CONNECTION_ICONS[key] || LinkIcon;
          const iconColor = CONNECTION_COLORS[key] || 'text-gray-300';

          return (
            <div key={key} className="flex items-center justify-between gap-3 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <Icon size={16} className={iconColor} />
                <span className="capitalize">{key}</span>
              </div>
              <span className="text-gray-100 font-medium">{value?.name || value?.id || 'Unknown'}</span>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default ConnectionsCard;
