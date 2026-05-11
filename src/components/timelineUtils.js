export const TIMELINE_PHASES = [
  {
    key: 'overworld',
    label: 'Overworld',
    shortLabel: 'OW',
    colorClass: 'bg-[#55ff55]',
    aliases: ['projectelo.timeline.reset'],
  },
  {
    key: 'nether',
    label: 'Nether',
    shortLabel: 'Nether',
    colorClass: 'bg-[#ff5555]',
    aliases: ['story.enter_the_nether'],
  },
  {
    key: 'bastion',
    label: 'Bastion',
    shortLabel: 'Bastion',
    colorClass: 'bg-[#222222]',
    aliases: ['nether.find_bastion', 'nether.loot_bastion'],
  },
  {
    key: 'fortress',
    label: 'Fortress',
    shortLabel: 'Fortress',
    colorClass: 'bg-[#660000]',
    aliases: ['nether.find_fortress', 'nether.obtain_blaze_rod'],
  },
  {
    key: 'blind',
    label: 'Blind Travel',
    shortLabel: 'Blind',
    colorClass: 'bg-[#7755ee]',
    aliases: ['projectelo.timeline.blind_travel'],
  },
  {
    key: 'stronghold',
    label: 'Stronghold',
    shortLabel: 'Stronghold',
    colorClass: 'bg-[#77aa88]',
    aliases: ['story.follow_ender_eye'],
  },
  {
    key: 'end',
    label: 'The End',
    shortLabel: 'End',
    colorClass: 'bg-[#e2e2aa]',
    aliases: ['story.enter_the_end'],
  },
  {
    key: 'complete',
    label: 'Complete',
    shortLabel: 'Complete',
    colorClass: 'bg-[#d6d69f]',
    aliases: ['projectelo.timeline.dragon_death', 'end.kill_dragon', 'projectelo.timeline.complete'],
  },
];

const PHASE_ALIAS_TO_KEY = TIMELINE_PHASES.reduce((map, phase) => {
  phase.aliases.forEach((alias) => {
    map[alias] = phase.key;
  });
  return map;
}, {});

export const getTimelineDataForPlayer = (match, playerUuid) => {
  if (!match || !playerUuid) return null;

  const timelines = (match.timelines || [])
    .filter((timeline) => timeline.uuid === playerUuid)
    .sort((a, b) => a.time - b.time);

  const completion = (match.completions || []).find((entry) => entry.uuid === playerUuid);
  const completeEvent = timelines.find((entry) => PHASE_ALIAS_TO_KEY[entry.type] === 'complete');

  const phaseTimes = {
    overworld: 0,
    nether: null,
    bastion: null,
    fortress: null,
    blind: null,
    stronghold: null,
    end: null,
    complete: typeof completion?.time === 'number' ? completion.time : null,
  };

  timelines.forEach((timeline) => {
    const key = PHASE_ALIAS_TO_KEY[timeline.type];
    if (!key) return;

    if (typeof phaseTimes[key] !== 'number') {
      phaseTimes[key] = timeline.time;
    }
  });

  if (typeof phaseTimes.complete !== 'number' && typeof completeEvent?.time === 'number') {
    phaseTimes.complete = completeEvent.time;
  }

  const finalTime =
    phaseTimes.complete ||
    (timelines.length > 0 ? timelines[timelines.length - 1].time : null) ||
    match.result?.time ||
    null;

  return {
    phaseTimes,
    finalTime,
    splitCount: timelines.length,
  };
};

const getVsPlayers = (match, userUuid) => {
  if (!Array.isArray(match?.players) || match.players.length === 0) return [null, null];

  const self = match.players.find((player) => player.uuid === userUuid) || match.players[0];
  const opponent = match.players.find((player) => player.uuid !== self.uuid) || match.players[1] || null;
  return [self, opponent];
};

export const buildSelectedTimelineRows = (selectedTimelineMatches, userUuid) =>
  selectedTimelineMatches
    .filter((selectedMatch) => Array.isArray(selectedMatch.players) && selectedMatch.players.length > 0)
    .map((selectedMatch) => {
      const [self, opponent] = getVsPlayers(selectedMatch, userUuid);

      return {
        matchId: selectedMatch.id,
        matchDate: selectedMatch.date,
        self: self
          ? {
              player: self,
              timeline: getTimelineDataForPlayer(selectedMatch, self.uuid),
            }
          : null,
        opponent: opponent
          ? {
              player: opponent,
              timeline: getTimelineDataForPlayer(selectedMatch, opponent.uuid),
            }
          : null,
      };
    });

export const averageTimelines = (rows, sideKey) => {
  const sums = {};
  const counts = {};

  TIMELINE_PHASES.forEach((phase) => {
    sums[phase.key] = 0;
    counts[phase.key] = 0;
  });

  rows.forEach((row) => {
    const timeline = row?.[sideKey]?.timeline;
    if (!timeline) return;

    TIMELINE_PHASES.forEach((phase) => {
      const value = timeline.phaseTimes[phase.key];
      if (typeof value === 'number') {
        sums[phase.key] += value;
        counts[phase.key] += 1;
      }
    });
  });

  const averages = {};
  TIMELINE_PHASES.forEach((phase) => {
    averages[phase.key] = counts[phase.key] > 0 ? Math.round(sums[phase.key] / counts[phase.key]) : null;
  });

  return averages;
};
