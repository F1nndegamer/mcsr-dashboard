import React, { useEffect, useState } from "react";
import ProfileCard from "./components/ProfileCard";
import MatchRecordCard from "./components/MatchRecordCard";
import PersonalBestCard from "./components/PersonalBestCard";
import EloProgressionCard from "./components/EloProgressionCard";
import EloInsightsCard from "./components/EloInsightsCard";
import MatchDetailsCard from "./components/MatchDetailsCard";
import AverageTimelinesCard from "./components/AverageTimelinesCard";
import ConnectionsCard from "./components/ConnectionsCard";
import RecentMatchesCard from "./components/RecentMatchesCard";
import ActivityCard from "./components/ActivityCard";
import StreaksCard from "./components/StreaksCard";
import RhythmCard from "./components/RhythmCard";
import VolatilityCard from "./components/VolatilityCard";
import PaceCard from "./components/PaceCard";
import NetherEnterBySeedCard from "./components/NetherEnterBySeedCard";
import { buildSelectedTimelineRows } from "./components/timelineUtils";
import {
  API_BASE,
  RANKED_MATCH_TYPE,
  fetchAllRankedMatches,
  resolveUsername,
} from "./api/mcsrApi";

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
        id: "current",
        season: null,
        date: null,
        label: "Now",
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

const buildAllTimeEloProgression = (rankedMatches, userUuid) => {
  if (!Array.isArray(rankedMatches) || !userUuid) return [];

  const rawPoints = [...rankedMatches]
    .sort((a, b) => {
      if (a.date === b.date) return a.id - b.id;
      return a.date - b.date;
    })
    .reduce((points, match) => {
      const userChange = (match.changes || []).find(
        (entry) => entry.uuid === userUuid,
      );

      if (typeof userChange?.eloRate !== "number") {
        return points;
      }

      // Use match end timestamp (start + result duration) so points represent Elo after the match
      const startMs = typeof match.date === "number" ? match.date * 1000 : null;
      const endMs =
        startMs != null && typeof match.result?.time === "number"
          ? startMs + match.result.time
          : startMs;

      points.push({
        id: match.id,
        season: match.season,
        date: endMs,
        elo: userChange.eloRate,
        change: typeof userChange.change === "number" ? userChange.change : 0,
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
    .filter((rank) => typeof rank === "number");

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
  const [error, setError] = useState("");
  const [isLoadingAverageTimelines, setIsLoadingAverageTimelines] =
    useState(false);
  const [isLoadingNetherBySeed, setIsLoadingNetherBySeed] = useState(false);
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
        setError("");

        const userResponse = await fetch(`${API_BASE}/users/${username}`);
        const userData = await userResponse.json();

        if (userData.status !== "success" || !userData.data) {
          throw new Error("Could not load user profile from API.");
        }

        const [matchesResponse, rankedRecentResponse, rankedMatchData] =
          await Promise.all([
            fetch(`${API_BASE}/users/${username}/matches?count=50&sort=newest`),
            fetch(
              `${API_BASE}/users/${username}/matches?count=50&sort=newest&type=${RANKED_MATCH_TYPE}`,
            ),
            fetchAllRankedMatches(username),
          ]);

        const [matchData, rankedRecentData] = await Promise.all([
          matchesResponse.json(),
          rankedRecentResponse.json(),
        ]);

        if (matchData.status !== "success" || !Array.isArray(matchData.data)) {
          throw new Error("Could not load matches from API.");
        }

        if (
          rankedRecentData.status !== "success" ||
          !Array.isArray(rankedRecentData.data)
        ) {
          throw new Error("Could not load recent ranked matches from API.");
        }

        setUser(userData.data);
        setMatches(matchData.data);
        setRankedRecentMatches(rankedRecentData.data);
        setAllTimeRankedMatches(rankedMatchData);
      } catch (fetchError) {
        setError(fetchError.message || "Unexpected API error.");
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

      const recentIds = rankedRecentMatches
        .slice(0, 50)
        .map((match) => match.id);
      const missingIds = recentIds.filter((id) => !matchDetailsCache[id]);

      if (missingIds.length === 0) return;

      try {
        setIsLoadingAverageTimelines(true);

        const fetched = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const response = await fetch(`${API_BASE}/matches/${id}`);
              const result = await response.json();
              return result.status === "success" && result.data
                ? result.data
                : null;
            } catch {
              return null;
            }
          }),
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
    let cancelled = false;

    const fetchQueueTimelineMatches = async () => {
      const queueMatches = matches
        .filter((match) => match.type === RANKED_MATCH_TYPE)
        .slice(0, 50);

      if (!queueMatches.length) return;

      const missingIds = queueMatches
        .map((match) => match.id)
        .filter((id) => !matchDetailsCache[id]);

      if (missingIds.length === 0) return;

      try {
        setIsLoadingNetherBySeed(true);

        const fetched = await Promise.all(
          missingIds.map(async (id) => {
            try {
              const response = await fetch(`${API_BASE}/matches/${id}`);
              const result = await response.json();
              return result.status === "success" && result.data
                ? result.data
                : null;
            } catch {
              return null;
            }
          }),
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
        if (!cancelled) setIsLoadingNetherBySeed(false);
      }
    };

    fetchQueueTimelineMatches();

    return () => {
      cancelled = true;
    };
  }, [matches, matchDetailsCache]);

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

        if (result.status === "success" && result.data) {
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
        <div className="glass-panel p-6 text-center text-gray-300">
          Loading profile data...
        </div>
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="min-h-screen p-6 max-w-[1600px] mx-auto">
        <div className="glass-panel p-6 text-center text-red-300">
          {error || "No data available for this user."}
        </div>
      </main>
    );
  }

  const seasonStats = user.statistics?.season || {};
  const totalStats = user.statistics?.total || {};
  const wins = seasonStats.wins?.ranked || 0;
  const losses = seasonStats.loses?.ranked || 0;
  const played = seasonStats.playedMatches?.ranked || wins + losses;
  const allTimeEloProgression = buildAllTimeEloProgression(
    allTimeRankedMatches,
    user.uuid,
  );
  const seasonFallbackProgression = buildSeasonEloProgression(
    user.seasonResult,
  );
  const eloProgression =
    allTimeEloProgression.length > 0
      ? allTimeEloProgression
      : seasonFallbackProgression;
  const selectedFromHover = hoveredEloPoint?.match || null;
  const detailedMatch = selectedMatchId
    ? selectedMatchDetails || selectedMatchPreview
    : selectedFromHover;
  const selectedTimelineMatches =
    selectedMatchId && detailedMatch ? [detailedMatch] : [];
  const timelineRows = buildSelectedTimelineRows(
    selectedTimelineMatches,
    user.uuid,
  );
  const recentDetailedMatches = rankedRecentMatches
    .slice(0, 50)
    .map((match) => matchDetailsCache[match.id] || null)
    .filter(Boolean);
  const averageTimelineRows = buildSelectedTimelineRows(
    recentDetailedMatches,
    user.uuid,
  );
  const queueWindowMatches = matches
    .filter((match) => match.type === RANKED_MATCH_TYPE)
    .slice(0, 50);
  const detailedQueueMatches = queueWindowMatches
    .map((match) => matchDetailsCache[match.id] || null)
    .filter(Boolean);
  const bestMatchRank = getBestMatchRank(matches);
  const seasonNumber = matches[0]?.season || "Current";

  const bestSeasonTime = seasonStats.bestTime?.ranked ?? null;
  const bestAllTime = totalStats.bestTime?.ranked ?? null;

  return (
    <main className="min-h-screen p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <ProfileCard user={user} />
        <MatchRecordCard
          wins={wins}
          losses={losses}
          played={played}
          season={seasonNumber}
        />
        <ActivityCard timestamp={user.timestamp} />
        <EloInsightsCard data={allTimeEloProgression} />
        <StreaksCard
          rankedMatches={allTimeRankedMatches}
          userUuid={user.uuid}
        />
        <VolatilityCard
          rankedMatches={allTimeRankedMatches}
          userUuid={user.uuid}
        />
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
        <AverageTimelinesCard
          timelineRows={averageTimelineRows}
          isLoading={isLoadingAverageTimelines}
          totalWindow={Math.min(rankedRecentMatches.length, 50)}
        />
        <MatchDetailsCard
          match={detailedMatch}
          userUuid={user.uuid}
          timelineRows={timelineRows}
          isLoadingDetails={isLoadingMatchDetails}
          sourceLabel={
            selectedMatchId
              ? "Selected Match"
              : hoveredEloPoint?.match
                ? "Hover Preview"
                : "No Match"
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* <SeasonPeaksCard data={allTimeEloProgression} /> */}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-6">
        <RhythmCard rankedMatches={allTimeRankedMatches} userUuid={user.uuid} />
        <PaceCard rankedMatches={allTimeRankedMatches} userUuid={user.uuid} />
        <ConnectionsCard connections={user.connections} />
        {/* <WeeklyRaceCard weeklyRaces={user.weeklyRaces} /> */}
        <RecentMatchesCard
          matches={matches}
          userUuid={user.uuid}
          onMatchSelect={handleMatchSelect}
          selectedMatchId={selectedMatchId}
        />
        <NetherEnterBySeedCard
          matches={detailedQueueMatches}
          userUuid={user.uuid}
          totalWindow={queueWindowMatches.length}
          isLoading={isLoadingNetherBySeed}
        />
      </div>
    </main>
  );
};

export default App;
