import React, { useMemo } from 'react';

const DAILY_GOAL = 2;

const getDateKey = (timestampSeconds) => {
  if (typeof timestampSeconds !== 'number') return null;

  return new Date(timestampSeconds * 1000).toISOString().split('T')[0];
};

const DailyProgressCard = ({ rankedMatches }) => {

  const { todayMatches, succeededDays, failedDays, trackedDays } = useMemo(() => {
    if (!Array.isArray(rankedMatches) || rankedMatches.length === 0) {
      return { todayMatches: 0, succeededDays: 0, failedDays: 0, trackedDays: 0 };
    }

    const matchesByDate = {};

    rankedMatches.forEach((match) => {
      const dateString = getDateKey(match.date);

      if (!dateString) return;

      if (!matchesByDate[dateString]) {
        matchesByDate[dateString] = [];
      }
      matchesByDate[dateString].push(match);
    });

    const todayDateString = new Date().toISOString().split('T')[0];
    const todayCount = matchesByDate[todayDateString]?.length || 0;

    let succeeded = 0;
    let failed = 0;

    Object.values(matchesByDate).forEach((dailyMatches) => {
      const matchCount = dailyMatches.length;

      if (matchCount >= DAILY_GOAL) {
        succeeded++;
      } else {
        failed++;
      }
    });

    return {
      todayMatches: todayCount,
      succeededDays: succeeded,
      failedDays: failed,
      trackedDays: Object.keys(matchesByDate).length,
    };
  }, [rankedMatches]);

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
          <p className="text-xs text-gray-400 mb-2">Days at Goal</p>
          <p className="text-3xl font-bold text-minecraft-green">{succeededDays}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-2">Missed Days</p>
          <p className="text-3xl font-bold text-red-400">{failedDays}</p>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-gray-500">Checked {trackedDays} ranked match days total.</p>
    </div>
  );
};

export default DailyProgressCard;
