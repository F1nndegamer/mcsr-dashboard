import React from 'react';
import { Youtube, Twitch, Monitor, Clock } from 'lucide-react';

const StreamInfoCard = ({
  twitchHandle,
  twitchUrl,
  youtubeHandle,
  youtubeUrl,
  liveStatus,
  streamUrl,
}) => {
  const twitchHref = twitchUrl || twitchHandle ? `https://twitch.tv/${twitchHandle || ''}` : null;
  const youtubeHref = youtubeUrl || youtubeHandle ? `https://www.youtube.com/@${youtubeHandle || ''}` : null;
  const streamHref = streamUrl || null;

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase text-minecraft-gold mb-4">
        Stream
      </h3>

      {!twitchHandle && !youtubeHandle ? (
        <p className="text-sm text-gray-400">
          No stream links connected yet. Add your Twitch and YouTube handles above.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
            <div className="flex items-center gap-3">
              <Twitch size={16} className="text-purple-400" />
              <span className="capitalize">Twitch</span>
            </div>
            <a
              href={twitchHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-100 font-medium truncate max-w-[200px] sm:max-w-none"
            >
              {twitchHandle || 'Unknown'}
            </a>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
            <div className="flex items-center gap-3">
              <Youtube size={16} className="text-red-500" />
              <span className="capitalize">YouTube</span>
            </div>
            <a
              href={youtubeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-100 font-medium truncate max-w-[200px] sm:max-w-none"
            >
              {youtubeHandle || 'Unknown'}
            </a>
          </div>

          {streamHref && (
            <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
              <div className="flex items-center gap-3">
                <Monitor size={16} className="text-indigo-400" />
                <span>Watch / VOD</span>
              </div>
              <a
                href={streamHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-100 font-medium text-xs truncate max-w-[240px] sm:max-w-none"
              >
                {streamUrl}
              </a>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 text-sm text-gray-300">
            <div className="flex items-center gap-3">
              <Clock size={16} className="text-gray-400" />
              <span>Live status</span>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded border font-medium ${
                liveStatus === 'online'
                  ? 'border-green-400/40 text-green-400 bg-green-400/5'
                  : liveStatus === 'offline'
                  ? 'border-red-400/40 text-red-300 bg-red-400/5'
                  : 'border-white/10 text-gray-400 bg-white/5'
              }`}
            >
              {liveStatus || '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StreamInfoCard;
