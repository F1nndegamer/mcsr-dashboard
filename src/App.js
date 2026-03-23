import React, { useEffect, useState } from 'react';
import ProfileCard from './components/ProfileCard';
import MatchRecordCard from './components/MatchRecordCard';
import PersonalBestCard from './components/PersonalBestCard';
import EloProgressionCard from './components/EloProgressionCard';
import ConnectionsCard from './components/ConnectionsCard';
import RecentMatchesCard from './components/RecentMatchesCard';
import ActivityCard from './components/ActivityCard';
import WeeklyRaceCard from './components/WeeklyRaceCard';

const API_BASE = 'https://api.mcsrranked.com';
const DEFAULT_USER = 'F1nndegamer';

const resolveUsername = () => {
  const queryUser = new URLSearchParams(window.location.search).get('user');
  return queryUser || DEFAULT_USER;
};

const buildEloProgression = (seasonResult) => {
  if (!seasonResult) return [];

  const phaseData = (seasonResult.phases || []).map((phase) => ({
    label: `P${phase.phase}`,
    elo: phase.eloRate,
  }));

  const currentData = seasonResult.last
    ? {
        label: 'Now',
        elo: seasonResult.last.eloRate,
      }
    : null;

  if (!currentData) return phaseData;
  if (phaseData.length === 0) return [currentData];
  if (phaseData[phaseData.length - 1].elo === currentData.elo) return phaseData;

  return [...phaseData, currentData];
};

const getBestMatchRank = (matches) => {
  const ranks = matches
    .map((match) => match?.rank?.allTime)
    .filter((rank) => typeof rank === 'number');

  return ranks.length ? Math.min(...ranks) : null;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const username = resolveUsername();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError('');

        const [userResponse, matchesResponse] = await Promise.all([
          fetch(`${API_BASE}/users/${username}`),
          fetch(`${API_BASE}/users/${username}/matches?count=20&sort=newest`),
        ]);

        const [userData, matchData] = await Promise.all([
          userResponse.json(),
          matchesResponse.json(),
        ]);

        if (userData.status !== 'success' || !userData.data) {
          throw new Error('Could not load user profile from API.');
        }

        if (matchData.status !== 'success' || !Array.isArray(matchData.data)) {
          throw new Error('Could not load matches from API.');
        }

        setUser(userData.data);
        setMatches(matchData.data);
      } catch (fetchError) {
        setError(fetchError.message || 'Unexpected API error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [username]);

  if (isLoading) {
    return (
      <main className="min-h-screen p-6 max-w-[1600px] mx-auto">
        <div className="glass-panel p-6 text-center text-gray-300">Loading profile data...</div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="min-h-screen p-6 max-w-[1600px] mx-auto">
        <div className="glass-panel p-6 text-center text-red-300">
          {error || 'No data available for this user.'}
        </div>
      </main>
    );
  }

  const seasonStats = user.statistics?.season || {};
  const totalStats = user.statistics?.total || {};
  const wins = seasonStats.wins?.ranked || 0;
  const losses = seasonStats.loses?.ranked || 0;
  const played = seasonStats.playedMatches?.ranked || wins + losses;
  const eloProgression = buildEloProgression(user.seasonResult);
  const bestMatchRank = getBestMatchRank(matches);
  const seasonNumber = matches[0]?.season || 'Current';

  const bestSeasonTime = seasonStats.bestTime?.ranked ?? null;
  const bestAllTime = totalStats.bestTime?.ranked ?? null;

  return (
    <main className="min-h-screen p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <ProfileCard user={user} />
        <MatchRecordCard wins={wins} losses={losses} played={played} season={seasonNumber} />
        <ActivityCard timestamp={user.timestamp} />
      </div>

      <div className="lg:col-span-6 space-y-6">
        <PersonalBestCard
          bestSeasonTime={bestSeasonTime}
          bestAllTime={bestAllTime}
          allTimeRank={bestMatchRank}
        />
        <EloProgressionCard data={eloProgression} />
      </div>

      <div className="lg:col-span-3 space-y-6">
        <ConnectionsCard connections={user.connections} />
        <WeeklyRaceCard weeklyRaces={user.weeklyRaces} />
        <RecentMatchesCard matches={matches} userUuid={user.uuid} />
      </div>
    </main>
  );
};

export default App;