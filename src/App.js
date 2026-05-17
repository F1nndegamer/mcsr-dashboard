import React, { useEffect, useState } from 'react';
import ProfileCard from './components/ProfileCard';
import MatchRecordCard from './components/MatchRecordCard';
import PersonalBestCard from './components/PersonalBestCard';
import EloProgressionCard from './components/EloProgressionCard';
import EloInsightsCard from './components/EloInsightsCard';
import SeasonPeaksCard from './components/SeasonPeaksCard';
import MatchDetailsCard from './components/MatchDetailsCard';
import AverageTimelinesCard from './components/AverageTimelinesCard';
import ConnectionsCard from './components/ConnectionsCard';
import RecentMatchesCard from './components/RecentMatchesCard';
import ActivityCard from './components/ActivityCard';
import WeeklyRaceCard from './components/WeeklyRaceCard';
import DailyProgressCard from './components/DailyProgressCard';
import { buildSelectedTimelineRows } from './components/timelineUtils';
const API_BASE = 'https://api.mcsrranked.com';
const DEFAULT_USER = 'Fourthdylan';
const RANKED_MATCH_TYPE = 2;
const PRIVATE_MATCH_TYPE = 3;
const MATCHES_PAGE_SIZE = 100;
const MAX_RANKED_PAGES = 450;


const RecentTypesSummaryCard = ({ matches }) => {
  const ranked = matches.filter((match) => match.type === RANKED_MATCH_TYPE);
  const privates = matches.filter((match) => match.type === PRIVATE_MATCH_TYPE);

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold uppercase mb-4">Recent Queue Split</h3>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Ranked</span>
          <span className="text-minecraft-green font-semibold">{ranked.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Private</span>
          <span className="text-minecraft-gold font-semibold">{privates.length}</span>
        </div>
      </div>
    </div>
  );
};

const resolveUsername = () => {
  const queryUser = new URLSearchParams(window.location.search).get('user');
  return queryUser || DEFAULT_USER;
};

const buildSeasonEloProgression = (seasonResult) => {
  if (!seasonResult) return [];

  const phaseData = (seasonResult.phases || []).map((phase, index) => ({
    id: `phase-${phase.phase}`,
    season: null,
    date: null,
    elo: phase.eloRate,
    change: null,
    resultTime: null,
    forfeited: false,
    match: null,
    matchIndex: index + 1,
    label: `P${phase.phase}`,
  }));

  const currentData = seasonResult.last
    ? {
        id: 'current',
        season: null,
        date: null,
        label: 'Now',
        elo: seasonResult.last.eloRate,
        change: null,
        resultTime: null,
        forfeited: false,
        match: null,
        matchIndex: phaseData.length + 1,
      }
    : null;

  if (!currentData) return phaseData;
  if (phaseData.length === 0) return [currentData];
  if (phaseData[phaseData.length - 1].elo === currentData.elo) return phaseData;

  return [...phaseData, currentData];
};

const fetchAllRankedMatches = async (username) => {
  const allMatches = [];
  let afterCursor = null;

  for (let page = 0; page < MAX_RANKED_PAGES; page += 1) {
    const params = new URLSearchParams({
      count: String(MATCHES_PAGE_SIZE),
      sort: 'oldest',
      type: String(RANKED_MATCH_TYPE),
    });

    if (afterCursor) {
      params.set('after', String(afterCursor));
    }

    const response = await fetch(`${API_BASE}/users/${username}/matches?${params.toString()}`);
    const result = await response.json();

    if (result.status !== 'success' || !Array.isArray(result.data)) {
      throw new Error('Could not load all-time ranked match history.');
    }

    const pageMatches = result.data;
    if (pageMatches.length === 0) {
      break;
    }

    allMatches.push(...pageMatches);

    if (pageMatches.length < MATCHES_PAGE_SIZE) {
      break;
    }

    const lastId = pageMatches[pageMatches.length - 1]?.id;
    if (!lastId || lastId === afterCursor) {
      break;
    }

    afterCursor = lastId;
  }

  return allMatches;
};

const buildAllTimeEloProgression = (rankedMatches, userUuid) => {
  if (!Array.isArray(rankedMatches) || !userUuid) return [];

  const rawPoints = [...rankedMatches]
    .sort((a, b) => {
      if (a.date === b.date) return a.id - b.id;
      return a.date - b.date;
    })
    .reduce((points, match) => {
      const userChange = (match.changes || []).find((entry) => entry.uuid === userUuid);

      if (typeof userChange?.eloRate !== 'number') {
        return points;
      }

      // Use match end timestamp (start + result duration) so points represent Elo after the match
      const startMs = typeof match.date === 'number' ? match.date * 1000 : null;
      const endMs = startMs != null && typeof match.result?.time === 'number' ? startMs + match.result.time : startMs;

      points.push({
        id: match.id,
        season: match.season,
        date: endMs,
        elo: userChange.eloRate,
        change: typeof userChange.change === 'number' ? userChange.change : 0,
        resultTime: match.result?.time ?? null,
        forfeited: Boolean(match.forfeited),
        match,
      });

      return points;
    }, []);

  return rawPoints.map((point, index) => ({
    ...point,
    matchIndex: index + 1,
  }));
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
  const [rankedRecentMatches, setRankedRecentMatches] = useState([]);
  const [allTimeRankedMatches, setAllTimeRankedMatches] = useState([]);
  const [hoveredEloPoint, setHoveredEloPoint] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [selectedMatchPreview, setSelectedMatchPreview] = useState(null);
  const [selectedMatchDetails, setSelectedMatchDetails] = useState(null);
  const [matchDetailsCache, setMatchDetailsCache] = useState({});
  const [isLoadingMatchDetails, setIsLoadingMatchDetails] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingAverageTimelines, setIsLoadingAverageTimelines] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const username = resolveUsername();

  const handleMatchSelect = (match) => {
    if (!match?.id) return;
    setSelectedMatchId(match.id);
    setSelectedMatchPreview(match);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError('');

        const userResponse = await fetch(`${API_BASE}/users/${username}`);
        const userData = await userResponse.json();

        if (userData.status !== 'success' || !userData.data) {
          throw new Error('Could not load user profile from API.');
        }

        const [matchesResponse, rankedRecentResponse, rankedMatchData] = await Promise.all([
          fetch(`${API_BASE}/users/${username}/matches?count=50&sort=newest`),
          fetch(`${API_BASE}/users/${username}/matches?count=50&sort=newest&type=${RANKED_MATCH_TYPE}`),
          fetchAllRankedMatches(username),
        ]);

        const [matchData, rankedRecentData] = await Promise.all([
          matchesResponse.json(),
          rankedRecentResponse.json(),
        ]);

        if (matchData.status !== 'success' || !Array.isArray(matchData.data)) {
          throw new Error('Could not load matches from API.');
        }

        if (rankedRecentData.status !== 'success' || !Array.isArray(rankedRecentData.data)) {
          throw new Error('Could not load recent ranked matches from API.');
        }

        setUser(userData.data);
        setMatches(matchData.data);
        setRankedRecentMatches(rankedRecentData.data);
        setAllTimeRankedMatches(rankedMatchData);
      } catch (fetchError) {
        setError(fetchError.message || 'Unexpected API error.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [username]);

  useEffect(() => {
    let cancelled = false;

    const fetchAverageTimelineMatches = async () => {
      if (!rankedRecentMatches.length) return;

      const recentIds = rankedRecentMatches.slice(0, 50).map((match) => match.id);
      const missingIds = recentIds.filter((id) => !matchDetailsCache[id]);

      if (missingIds.length === 0) return;

      try {
        setIsLoadingAverageTimelines(true);

        const fetched = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const response = await fetch(`${API_BASE}/matches/${id}`);
              const result = await response.json();
              return result.status === 'success' && result.data ? result.data : null;
            } catch {
              return null;
            }
          })
        );

        if (cancelled) return;

        const fetchedMap = fetched.reduce((acc, item) => {
          if (item?.id) acc[item.id] = item;
          return acc;
        }, {});

        if (Object.keys(fetchedMap).length > 0) {
          setMatchDetailsCache((previous) => ({
            ...previous,
            ...fetchedMap,
          }));
        }
      } finally {
        if (!cancelled) setIsLoadingAverageTimelines(false);
      }
    };

    fetchAverageTimelineMatches();

    return () => {
      cancelled = true;
    };
  }, [rankedRecentMatches, matchDetailsCache]);

  useEffect(() => {
    const selectedId = selectedMatchId;
    if (!selectedId) {
      setSelectedMatchDetails(null);
      return;
    }

    const cached = matchDetailsCache[selectedId];
    if (cached) {
      setSelectedMatchDetails(cached);
      setIsLoadingMatchDetails(false);
      return;
    }

    const fetchMatchDetails = async () => {
      try {
        setIsLoadingMatchDetails(true);

        const response = await fetch(`${API_BASE}/matches/${selectedId}`);
        const result = await response.json();

        if (result.status === 'success' && result.data) {
          setSelectedMatchDetails(result.data);
          setMatchDetailsCache((previous) => ({
            ...previous,
            [selectedId]: result.data,
          }));
          return;
        }

        setSelectedMatchDetails(selectedMatchPreview);
      } catch {
        setSelectedMatchDetails(selectedMatchPreview);
      } finally {
        setIsLoadingMatchDetails(false);
      }
    };

    fetchMatchDetails();
  }, [selectedMatchId, matchDetailsCache, selectedMatchPreview]);

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
  const allTimeEloProgression = buildAllTimeEloProgression(allTimeRankedMatches, user.uuid);
  const seasonFallbackProgression = buildSeasonEloProgression(user.seasonResult);
  const eloProgression = allTimeEloProgression.length > 0 ? allTimeEloProgression : seasonFallbackProgression;
  const selectedFromHover = hoveredEloPoint?.match || null;
  const detailedMatch = selectedMatchId ? selectedMatchDetails || selectedMatchPreview : selectedFromHover;
  const selectedTimelineMatches = selectedMatchId && detailedMatch ? [detailedMatch] : [];
  const timelineRows = buildSelectedTimelineRows(selectedTimelineMatches, user.uuid);
  const recentDetailedMatches = rankedRecentMatches
    .slice(0, 50)
    .map((match) => matchDetailsCache[match.id] || null)
    .filter(Boolean);
  const averageTimelineRows = buildSelectedTimelineRows(recentDetailedMatches, user.uuid);
  const bestMatchRank = getBestMatchRank(matches);
  const seasonNumber = matches[0]?.season || 'Current';

  const bestSeasonTime = seasonStats.bestTime?.ranked ?? null;
  const bestAllTime = totalStats.bestTime?.ranked ?? null;

  return (
    <main className="min-h-screen p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <ProfileCard user={user} />
        <MatchRecordCard wins={wins} losses={losses} played={played} season={seasonNumber} />
        <DailyProgressCard rankedMatches={allTimeRankedMatches} />
        <ActivityCard timestamp={user.timestamp} />
      </div>

      <div className="lg:col-span-6 space-y-6">
        <PersonalBestCard
          bestSeasonTime={bestSeasonTime}
          bestAllTime={bestAllTime}
          allTimeRank={bestMatchRank}
        />
        <EloProgressionCard
          data={eloProgression}
          onPointHover={setHoveredEloPoint}
          onPointSelect={(point) => {
            if (point?.match) {
              handleMatchSelect(point.match);
            }
          }}
          selectedMatchId={selectedMatchId}
        />
        <MatchDetailsCard
          match={detailedMatch}
          userUuid={user.uuid}
          timelineRows={timelineRows}
          isLoadingDetails={isLoadingMatchDetails}
          sourceLabel={selectedMatchId ? 'Selected Match' : hoveredEloPoint?.match ? 'Hover Preview' : 'No Match'}
        />
        <AverageTimelinesCard
          timelineRows={averageTimelineRows}
          isLoading={isLoadingAverageTimelines}
          totalWindow={Math.min(rankedRecentMatches.length, 50)}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EloInsightsCard data={allTimeEloProgression} />
          <SeasonPeaksCard data={allTimeEloProgression} />
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
        <ConnectionsCard connections={user.connections} />
        <WeeklyRaceCard weeklyRaces={user.weeklyRaces} />
        <RecentTypesSummaryCard matches={matches} />
        <RecentMatchesCard
          matches={matches}
          userUuid={user.uuid}
          onMatchSelect={handleMatchSelect}
          selectedMatchId={selectedMatchId}
        />
      </div>
    </main>
  );
};

export default App;