import React, { useMemo } from 'react';

const DAILY_GOAL = 2;
const START_DATE_UTC = Date.UTC(2026, 4, 11);
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const getDateKey = (timestampSeconds) => {
  if (typeof timestampSeconds !== 'number') return null;

  return new Date(timestampSeconds * 1000).toISOString().split('T')[0];
};

const formatDayLabel = (dateKey) => {
  const [, month, day] = dateKey.split('-').map((value) => Number(value));
  const monthName = MONTH_NAMES[month - 1] || '';
  const daySuffix = day % 10 === 1 && day % 100 !== 11 ? 'st' : day % 10 === 2 && day % 100 !== 12 ? 'nd' : day % 10 === 3 && day % 100 !== 13 ? 'rd' : 'th';

  return `${monthName} ${day}${daySuffix}`;
};

const buildDateRange = () => {
  const today = new Date();
  const todayUtcMidnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dates = [];

  for (let current = START_DATE_UTC; current <= todayUtcMidnight; current += 24 * 60 * 60 * 1000) {
    dates.push(new Date(current).toISOString().split('T')[0]);
  }

  return dates;
};

const DailyProgressCard = ({ rankedMatches }) => {

  const { todayMatches, succeededDays, failedDays, trackedDays, dayEntries } = useMemo(() => {
    if (!Array.isArray(rankedMatches) || rankedMatches.length === 0) {
      const emptyDates = buildDateRange();

      return {
        todayMatches: 0,
        succeededDays: 0,
        failedDays: emptyDates.length,
        trackedDays: 0,
        dayEntries: emptyDates.map((dateKey) => ({
          dateKey,
          label: formatDayLabel(dateKey),
          status: 'failed',
          count: 0,
        })),
      };
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
    const dayEntries = buildDateRange().map((dateKey) => {
      const count = matchesByDate[dateKey]?.length || 0;
      const status = count >= DAILY_GOAL ? 'completed' : 'failed';

      if (status === 'completed') {
        succeeded++;
      } else {
        failed++;
      }

      return {
        dateKey,
        label: formatDayLabel(dateKey),
        status,
        count,
      };
    });

    return {
      todayMatches: todayCount,
      succeededDays: succeeded,
      failedDays: failed,
      trackedDays: Object.keys(matchesByDate).length,
      dayEntries,
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
      <p className="mt-4 text-[11px] text-gray-500">(I started the challenge on May 11th, 2026)</p>


      <div className="mt-6 border-t border-gray-700 pt-5">
        <p className="text-xs text-gray-400 mb-3">Daily breakdown since May 11th</p>
        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
          {dayEntries.map((day) => (
            <div key={day.dateKey} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span className="text-gray-200">{day.label}</span>
              <span
                className={
                  day.status === 'completed' ? 'text-minecraft-green font-semibold' : 'text-red-300 font-semibold'
                }
              >
                {day.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DailyProgressCard;
