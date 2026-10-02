import { render, screen } from '@testing-library/react';
import App from './App';

const profileData = {
  uuid: 'abc123',
  nickname: 'Rekrap2',
  roleType: 3,
  eloRate: 1700,
  eloRank: 42,
  country: 'nl',
  timestamp: {},
  connections: {},
  weeklyRaces: [],
  statistics: {
    season: {
      wins: { ranked: 10 },
      loses: { ranked: 5 },
      playedMatches: { ranked: 15 },
      bestTime: { ranked: 500000 },
    },
    total: {
      bestTime: { ranked: 450000 },
    },
  },
  seasonResult: {
    phases: [],
    last: { eloRate: 1700 },
  },
};

beforeEach(() => {
  // URL-aware mock: profile endpoints return the user, match endpoints
  // return empty pages (fetchAllRankedMatches stops on a short page).
  global.fetch = jest.fn().mockImplementation((url) => {
    const target = String(url);

    if (target.includes('/matches')) {
      return Promise.resolve({
        json: async () => ({ status: 'success', data: [] }),
      });
    }

    return Promise.resolve({
      json: async () => ({ status: 'success', data: profileData }),
    });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders profile from API data', async () => {
  render(<App />);
  const name = await screen.findByText(/Rekrap2/i);
  expect(name).toBeInTheDocument();
});
