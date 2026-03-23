import React from 'react';

const ROLE_LABELS = {
  0: '',
  1: 'Stone Pickaxe',
  2: 'Iron Pickaxe',
  3: 'Diamond Pickaxe',
};

const toFlagEmoji = (countryCode) => {
  if (!countryCode || countryCode.length !== 2) return '??';

  return countryCode
    .toUpperCase()
    .split('')
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join('');
};

const ProfileCard = ({ user }) => (
  <div className="glass-panel p-6">
    <div className="flex items-center gap-4 mb-4">
      <img
        src={`https://mc-heads.net/avatar/${user.uuid}/64`}
        alt="skin"
        className="rounded-lg shadow-lg"
      />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {user.nickname} {toFlagEmoji(user.country)}
        </h1>
        <span className="bg-white/10 px-2 py-0.5 rounded text-xs uppercase text-gray-400">
          {ROLE_LABELS[user.roleType] || 'Player'}
        </span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
      <div>
        <p className="text-xs text-gray-400">Current ELO</p>
        <p className="text-2xl font-bold text-minecraft-green">{user.eloRate ?? 'Unranked'}</p>
      </div>
      <div>
        <p className="text-xs text-gray-400">Rank</p>
        <p className="text-2xl font-bold">{user.eloRank ? `#${user.eloRank}` : 'N/A'}</p>
      </div>
    </div>
  </div>
);

export default ProfileCard;
