import React from 'react';

const formatDuration = (ms) => {
  if (typeof ms !== 'number') return 'N/A';

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

const formatSigned = (value) => {
  if (typeof value !== 'number') return 'N/A';
  return `${value > 0 ? '+' : ''}${value}`;
};

const formatTimestamp = (seconds) => {
  if (typeof seconds !== 'number') return 'N/A';
  return new Date(seconds * 1000).toLocaleString();
};

const getUserChange = (match, userUuid) => {
  if (!match || !userUuid) return null;
  return (match.changes || []).find((change) => change.uuid === userUuid) || null;
};

const getResultLabel = (match, userUuid) => {
  if (!match) return 'N/A';
  if (match.forfeited) return 'Forfeit';
  if (!match.result?.uuid) return 'Draw';
  if (match.result.uuid === userUuid) return 'Win';
  return 'Loss';
};

const MatchDetailsCard = ({ match, userUuid, sourceLabel, isLoadingDetails }) => {
  if (!match) {
    return (
      <div className="glass-panel p-6">
        <h3 className="text-xs font-bold uppercase mb-1">Match Details</h3>
        <p className="text-xs text-gray-400 mb-4">Click a graph point or a recent match</p>
        <p className="text-sm text-gray-400">No match selected yet.</p>
      </div>
    );
  }

  const userChange = getUserChange(match, userUuid);
  const seedLabel = match.seed?.overworld || match.seed?.id || match.seedType || 'Unknown seed';
  const userTimelineCount = (match.timelines || []).filter((timeline) => timeline.uuid === userUuid).length;
  const userCompletion = (match.completions || []).find((completion) => completion.uuid === userUuid);
  const vodCount = Array.isArray(match.vod) ? match.vod.length : 0;

  return (
    <div className="glass-panel p-6 min-h-[330px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold uppercase">Match Details</h3>
        <div className="flex items-center gap-2">
          {isLoadingDetails ? <span className="text-[10px] text-gray-400">Refreshing...</span> : null}
          <span className="text-[10px] uppercase text-gray-400">{sourceLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-400">Match ID</p>
          <p className="text-gray-100">{match.id}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Season</p>
          <p className="text-gray-100">{match.season ?? 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Result</p>
          <p className="text-gray-100">{getResultLabel(match, userUuid)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Time</p>
          <p className="text-gray-100">{formatDuration(match.result?.time)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Elo Change</p>
          <p className={userChange?.change >= 0 ? 'text-minecraft-green font-semibold' : 'text-red-300 font-semibold'}>
            {formatSigned(userChange?.change)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Elo After Match</p>
          <p className="text-gray-100">{typeof userChange?.eloRate === 'number' ? userChange.eloRate : 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">All-time Rank</p>
          <p className="text-gray-100">{typeof match.rank?.allTime === 'number' ? `#${match.rank.allTime}` : 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Date</p>
          <p className="text-gray-100">{formatTimestamp(match.date)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Players</p>
          <p className="text-gray-100">{Array.isArray(match.players) ? match.players.length : 0}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Completions</p>
          <p className="text-gray-100">{Array.isArray(match.completions) ? match.completions.length : 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Your Completion</p>
          <p className="text-gray-100">{formatDuration(userCompletion?.time)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Your Splits</p>
          <p className="text-gray-100">{userTimelineCount || 'N/A'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Replay Exists</p>
          <p className="text-gray-100">{typeof match.replayExist === 'boolean' ? (match.replayExist ? 'Yes' : 'No') : 'N/A'}</p>
        </div>
      </div>
      
      {vodCount > 0 && Array.isArray(match.vod) && match.vod.length > 0 ? (
        <div className="mt-4 pt-3 border-t border-white/10">
          <p className="text-xs text-gray-400 mb-2">VOD Links ({vodCount})</p>
          <div className="space-y-2">
            {match.vod.map((vodEntry, index) => {
              const streamer = (match.players || []).find((player) => player.uuid === vodEntry.uuid);
              const streamerName = streamer?.nickname || 'Unknown';
              
              return (
                <a
                  key={index}
                  href={vodEntry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs px-3 py-1.5 rounded border border-minecraft-green/60 text-minecraft-green hover:bg-minecraft-green/10 transition"
                >
                  Watch {streamerName}
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 pt-3 border-t border-white/10 text-xs text-gray-400">
        Seed: <span className="text-gray-200">{seedLabel}</span>
      </div>
      {Array.isArray(match.players) && match.players.length > 0 ? (
        <div className="mt-3 text-xs text-gray-300">
          Players: {match.players.map((player) => player.nickname).join(', ')}
        </div>
      ) : null}
    </div>
  );
};

export default MatchDetailsCard;
