import { act, render, screen } from "@testing-library/react";
import StreamStatsOverlay from "./StreamStatsOverlay";

const USER_UUID = "abc123";

const getUtcStartOfToday = () => {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000,
  );
};

const todayStart = getUtcStartOfToday();
const nowSeconds = Math.floor(Date.now() / 1000);

const profileData = {
  uuid: USER_UUID,
  nickname: "Awenruns",
  eloRate: 1750,
  eloRank: 42,
  timestamp: {},
  connections: {},
  weeklyRaces: [],
  statistics: { season: {}, total: {} },
};

const todayMatchWon = {
  id: 101,
  type: 2,
  date: Math.max(todayStart, nowSeconds - 120),
  forfeited: false,
  result: { time: 600000, uuid: "opponent" },
  changes: [{ uuid: USER_UUID, change: 15, eloRate: 1765 }],
};

const todayMatchLost = {
  id: 102,
  type: 2,
  date: Math.max(todayStart, nowSeconds - 60),
  forfeited: false,
  result: { time: 300000, uuid: USER_UUID },
  changes: [{ uuid: USER_UUID, change: -10, eloRate: 1755 }],
};

const yesterdayMatch = {
  id: 100,
  type: 2,
  date: todayStart - 100000,
  forfeited: false,
  result: { time: 900000, uuid: USER_UUID },
  changes: [{ uuid: USER_UUID, change: 12, eloRate: 1750 }],
};

const createFetchMock = () =>
  jest.fn().mockImplementation((url) => {
    const target = String(url);

    if (target.includes("sort=newest")) {
      // Recent matches feed today's runs / today avg / ELO delta.
      return Promise.resolve({
        json: async () => ({
          status: "success",
          data: [todayMatchWon, todayMatchLost],
        }),
      });
    }

    if (target.includes("sort=oldest")) {
      // Full history page feeds the all-time average (short page stops paging).
      return Promise.resolve({
        json: async () => ({
          status: "success",
          data: [yesterdayMatch],
        }),
      });
    }

    return Promise.resolve({
      json: async () => ({ status: "success", data: profileData }),
    });
  });

beforeEach(() => {
  global.fetch = createFetchMock();
  window.history.pushState(
    {},
    "",
    "/?title=TEST%20CHALLENGE&total=500&goal=1000",
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

test("renders config-driven title, progress and computed API stats", async () => {
  render(<StreamStatsOverlay />);

  expect(
    await screen.findByText("TEST CHALLENGE", undefined, { timeout: 3000 }),
  ).toBeInTheDocument();

  // Local (non-API) config values.
  expect(screen.getByText("500")).toBeInTheDocument();
  expect(screen.getByText("500 / 1000")).toBeInTheDocument();

  // API-derived values.
  expect(screen.getByText("2")).toBeInTheDocument(); // runs today
  expect(screen.getByText("1750")).toBeInTheDocument(); // current ELO
  expect(screen.getByText("+5")).toBeInTheDocument(); // ELO diff today (15 - 10)
  expect(screen.getByText("7:30.000")).toBeInTheDocument(); // today avg
  expect(await screen.findByText("10:00.000")).toBeInTheDocument(); // all-time avg
  expect(screen.getByText("LIVE")).toBeInTheDocument();

  // Progress bar fill reflects 500/1000 = 50%.
  const fill = document.querySelector(".mcsr-overlay__progress-fill");
  expect(fill).not.toBeNull();
  expect(fill.style.width).toBe("50%");
});

test("keeps last known stats and flags offline state when a poll fails", async () => {
  jest.useFakeTimers();

  render(<StreamStatsOverlay />);

  expect(await screen.findByText("1750")).toBeInTheDocument();

  global.fetch.mockRejectedValueOnce(new Error("network down"));

  await act(async () => {
    jest.advanceTimersByTime(20000);
  });

  expect(screen.getByText("1750")).toBeInTheDocument();
  expect(screen.getByText("+5")).toBeInTheDocument();
  expect(screen.getByText("RECONNECTING...")).toBeInTheDocument();
});
