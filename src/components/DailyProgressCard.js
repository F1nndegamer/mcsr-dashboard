import React, { useMemo } from 'react';

const DailyProgressCard = ({ rankedRecentMatches }) => {
  const DAILY_GOAL = 2;

  // Calculate streaks from actual match data
  const { todayMatches, succeededDays, failedDays } = useMemo(() => {
    if (!Array.isArray(rankedRecentMatches) || rankedRecentMatches.length === 0) {
      return { todayMatches: 0, succeededDays: 0, failedDays: 0 };
    }

    // Get today's date at midnight
    const getTodayMidnight = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime();
    };

    const todayMidnight = getTodayMidnight();

    // Group matches by date
    const matchesByDate = {};

    rankedRecentMatches.forEach((match) => {
      const matchTime = typeof match.date === 'number' ? match.date * 1000 : 0;
      const matchDate = new Date(matchTime);
      matchDate.setHours(0, 0, 0, 0);
      const dateString = matchDate.toISOString().split('T')[0];

      if (!matchesByDate[dateString]) {
        matchesByDate[dateString] = [];
      }
      matchesByDate[dateString].push(match);
    });

    // Count today's matches
    const todayDateString = new Date(todayMidnight).toISOString().split('T')[0];
    const todayCount = matchesByDate[todayDateString]?.length || 0;

    // Calculate streaks starting from today going backwards
    let succeeded = 0;
    let failed = 0;

    const sortedDates = Object.keys(matchesByDate).sort().reverse();

    for (const dateString of sortedDates) {
      const matchCount = matchesByDate[dateString].length;
      const dayMidnight = new Date(dateString).getTime();

      // Only count days from today onwards (going backwards in time to start)
      if (dayMidnight > todayMidnight) {
        // Future date, skip
        continue;
      }

      if (matchCount >= DAILY_GOAL) {
        succeeded++;
      } else {
        failed++;
      }

      // Stop counting after we've found a day before today
      // This creates the "from today and after" effect
      if (dayMidnight < todayMidnight) {
        break;
      }
    }

    return {
      todayMatches: todayCount,
      succeededDays: succeeded,
      failedDays: failed,
    };
  }, [rankedRecentMatches]);

  const remainingMatches = Math.max(0, DAILY_GOAL - todayMatches);
  const goalMet = todayMatches >= DAILY_GOAL;

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xs font-bold text-minecraft-gold uppercase mb-6">Daily Progress</h3>

      {/* Today's Progress */}
      <div className="mb-6 pb-6 border-b border-gray-700">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">Today's Ranked Matches</span>
          <span className={`text-2xl font-bold ${goalMet ? 'text-minecraft-green' : 'text-gray-300'}`}>
            {todayMatches}/{DAILY_GOAL}
          </span>
        </div>
        {!goalMet && (
          <p className="text-xs text-gray-500">
            {remainingMatches} {remainingMatches === 1 ? 'match' : 'matches'} remaining
          </p>
        )}
      </div>

      {/* Streaks */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-2">Succeeded Days</p>
          <p className="text-3xl font-bold text-minecraft-green">{succeededDays}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-2">Failed Days</p>
          <p className="text-3xl font-bold text-red-400">{failedDays}</p>
        </div>
      </div>
    </div>
  );
};

export default DailyProgressCard;
