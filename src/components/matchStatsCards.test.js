import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChallengeProgressCard from "./ChallengeProgressCard";
import StreaksCard from "./StreaksCard";
import RhythmCard from "./RhythmCard";
import VolatilityCard from "./VolatilityCard";
import PaceCard from "./PaceCard";
import OpponentEloCard from "./OpponentEloCard";
import RecordsCard from "./RecordsCard";
import SplitTrendCard from "./SplitTrendCard";

const USER_UUID = "abc123";

const atUtc = (year, month, day, hour) =>
  Math.floor(Date.UTC(year, month - 1, day, hour) / 1000);

const makeMatch = ({
  id,
  dateSeconds,
  winner,
  change,
  time,
  forfeited = false,
  opponentElo,
}) => ({
  id,
  type: 2,
  season: 8,
  date: dateSeconds,
  forfeited,
  result: { uuid: winner, time },
  changes: [
    { uuid: USER_UUID, eloRate: 1700 + change, change },
    {
      uuid: "opponent",
      eloRate: opponentElo ?? 1700 - change,
      change: -change,
    },
  ],
});

// W, W, L, W -> current 1 win streak, best win streak 2, worst losing run 1.
const matches = [
  makeMatch({ id: 1, dateSeconds: atUtc(2026, 3, 2, 3), winner: USER_UUID, change: 10, time: 900000 }),
  makeMatch({ id: 2, dateSeconds: atUtc(2026, 3, 3, 21), winner: USER_UUID, change: 5, time: 660000 }),
  makeMatch({ id: 3, dateSeconds: atUtc(2026, 3, 4, 13), winner: "opponent", change: -12, time: 1500000 }),
  makeMatch({ id: 4, dateSeconds: atUtc(2026, 3, 5, 13), winner: USER_UUID, change: 30, time: 480000 }),
];

test("streaks card summarises streaks, form and momentum", () => {
  render(<StreaksCard rankedMatches={matches} userUuid={USER_UUID} />);

  expect(screen.getByText(/Streaks & Momentum/i)).toBeInTheDocument();
  expect(screen.getByText("1 win")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument(); // best win streak
  expect(screen.getByText("4 ranked matches tracked all-time")).toBeInTheDocument();
});

test("rhythm card reports peak grind window and active days", () => {
  render(<RhythmCard rankedMatches={matches} userUuid={USER_UUID} />);

  expect(screen.getByText(/Grind Rhythm/i)).toBeInTheDocument();
  // Peak = newest weekday/hour with the highest match count (all counts are 1).
  expect(screen.getByText("Thu 13:00")).toBeInTheDocument();
});

test("volatility card shows biggest climb and bounce back rate", () => {
  render(<VolatilityCard rankedMatches={matches} userUuid={USER_UUID} />);

  expect(screen.getByText(/Elo Volatility/i)).toBeInTheDocument();
  // "-12" appears both as average loss and as the biggest crash.
  expect(screen.getAllByText("-12")).toHaveLength(2);
  expect(screen.getByText("+30")).toBeInTheDocument();
  expect(screen.getByText("100% (1)")).toBeInTheDocument(); // loss -> win
});

test("pace card aggregates durations and length buckets", () => {
  render(<PaceCard rankedMatches={matches} userUuid={USER_UUID} />);

  expect(screen.getByText(/Pace & Speed/i)).toBeInTheDocument();
  expect(screen.getByText("8:00.000")).toBeInTheDocument(); // fastest win
  // Bucket counts: 8:00 -> <10m, 11:00 + 15:00 -> 10-15m, 25:00 -> 20-25m.
  const buckets = screen.getByText("Game Length Distribution").parentElement;

  expect(
    Array.from(buckets.querySelectorAll(".w-6")).map((node) => node.textContent),
  ).toEqual(["1", "2", "0", "1", "0"]);
});

test("challenge progress falls back to match history when the endpoint fails", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("no endpoint"));

  render(
    <ChallengeProgressCard
      rankedMatches={matches}
      userUuid={USER_UUID}
      goal={1000}
    />,
  );

  expect(screen.getByText(/1000 Run Challenge/i)).toBeInTheDocument();
  // 4 matches / 1000 goal.
  // The percentage is split across two nodes (value + "%"), so read the parent.
  const percentNode = screen.getByText("%").parentElement;
  expect(percentNode).toHaveTextContent("0.4%");
  expect(screen.getByText("4 / 1,000")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/API match history/i)).toBeInTheDocument());
});

test("challenge progress prefers the tracker spreadsheet total", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ totalRuns: 640, goalRuns: 1000 }),
  });

  render(
    <ChallengeProgressCard rankedMatches={matches} userUuid={USER_UUID} />,
  );

  // The spreadsheet value arrives asynchronously, so wait for it.
  await waitFor(() =>
    expect(screen.getByText("%").parentElement).toHaveTextContent("64.0%"),
  );
  expect(screen.getByText("640 / 1,000")).toBeInTheDocument();
  expect(screen.getByText("360 to go")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/tracker spreadsheet/i)).toBeInTheDocument());
});

test("challenge progress projects pace and switches windows", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("no endpoint"));

  render(
    <ChallengeProgressCard rankedMatches={matches} userUuid={USER_UUID} />,
  );

  expect(screen.getByText("Runs per day")).toBeInTheDocument();
  expect(screen.getByText(/days/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "50" }));

  // A 50-match window only has the same 4 matches, so the pace is unchanged.
  expect(screen.getByText("Runs per day")).toBeInTheDocument();
});

test("challenge progress handles an empty history safely", async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error("no endpoint"));

  render(<ChallengeProgressCard rankedMatches={[]} userUuid={USER_UUID} />);

  expect(screen.getByText("%").parentElement).toHaveTextContent("0.0%");
  expect(
    screen.getByText(/Need at least two timed matches to project a pace/i),
  ).toBeInTheDocument();
});

test("opponent elo card buckets win rate by opponent rating", () => {
  // Opponents: 1690/1695/1712 land in the 1600-1800 band, 2100 in 2000-2200.
  const withBands = [
    ...matches,
    makeMatch({
      id: 5,
      dateSeconds: atUtc(2026, 3, 6, 13),
      winner: "opponent",
      change: -5,
      time: 900000,
      opponentElo: 2100,
    }),
  ];

  render(<OpponentEloCard rankedMatches={withBands} userUuid={USER_UUID} />);

  expect(screen.getByText(/Who You Beat/i)).toBeInTheDocument();
  expect(screen.getByText("1600-1800")).toBeInTheDocument();
  expect(screen.getByText("2000-2200")).toBeInTheDocument();
  // 3W/1L in the low band (shown on the band row and again in Best band).
  expect(screen.getAllByText(/75%/)).toHaveLength(2);
  // The 2000-2200 band has a single game, so it is faded as a thin sample.
  expect(
    screen.getByText(/Faded bars have fewer than 3 games/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/1600-1800 • 75% over 4 games/i)).toBeInTheDocument();
});

test("records card surfaces daily and session extremes", () => {
  render(<RecordsCard rankedMatches={matches} userUuid={USER_UUID} />);

  expect(screen.getByText(/Records/i)).toBeInTheDocument();
  expect(screen.getByText("Best Elo day")).toBeInTheDocument();
  expect(screen.getByText("Most games in a day")).toBeInTheDocument();
  expect(screen.getByText("Longest session")).toBeInTheDocument();
  expect(screen.getByText("Fastest win")).toBeInTheDocument();
  expect(screen.getByText("8:00")).toBeInTheDocument();
});

test("records card handles an empty history", () => {
  render(<RecordsCard rankedMatches={[]} userUuid={USER_UUID} />);

  expect(screen.getByText(/No ranked matches to break yet/i)).toBeInTheDocument();
});

test("split trend card needs four timed runs before comparing", () => {
  render(<SplitTrendCard matches={[]} userUuid={USER_UUID} />);

  expect(screen.getByText(/No match timelines loaded to compare yet/i)).toBeInTheDocument();
});

const makeTimedMatch = ({ id, complete }) => ({
  id,
  type: 2,
  players: [{ uuid: USER_UUID }],
  completions: [{ uuid: USER_UUID, time: complete }],
  timelines: [
    { uuid: USER_UUID, type: "projectelo.timeline.reset", time: 0 },
    { uuid: USER_UUID, type: "story.enter_the_nether", time: Math.round(complete * 0.3) },
    { uuid: USER_UUID, type: "projectelo.timeline.blind_travel", time: Math.round(complete * 0.6) },
    { uuid: USER_UUID, type: "story.follow_ender_eye", time: Math.round(complete * 0.8) },
  ],
  result: { uuid: USER_UUID, time: complete },
});

test("split trend card buckets runs fastest to slowest", () => {
  const timed = [
    makeTimedMatch({ id: 11, complete: 400000 }),
    makeTimedMatch({ id: 12, complete: 500000 }),
    makeTimedMatch({ id: 13, complete: 600000 }),
    makeTimedMatch({ id: 14, complete: 900000 }),
  ];

  render(
    <SplitTrendCard matches={timed} userUuid={USER_UUID} totalWindow={50} />,
  );

  expect(screen.getByText(/Split Regression/i)).toBeInTheDocument();
  expect(screen.getByText("Fastest")).toBeInTheDocument();
  expect(screen.getByText("Slowest")).toBeInTheDocument();
  expect(screen.getByText("4/50 loaded")).toBeInTheDocument();
  // Slowest run is 900s vs fastest 400s.
  expect(screen.getByText("+8:20")).toBeInTheDocument();
});

test("cards render safe empty states without data", () => {
  render(
    <>
      <StreaksCard rankedMatches={[]} userUuid={USER_UUID} />
      <RhythmCard rankedMatches={[]} userUuid={USER_UUID} />
      <VolatilityCard rankedMatches={[]} userUuid={USER_UUID} />
      <PaceCard rankedMatches={[]} userUuid={USER_UUID} />
    </>,
  );

  expect(screen.getByText(/No ranked matches yet/i)).toBeInTheDocument();
  expect(screen.getByText(/No ranked matches to plot yet/i)).toBeInTheDocument();
  expect(screen.getByText(/No rated matches with Elo data yet/i)).toBeInTheDocument();
  expect(screen.getByText(/No timed ranked matches available yet/i)).toBeInTheDocument();
});