import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      json: async () => ({
        status: 'success',
        data: {
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
        },
      }),
    })
    .mockResolvedValueOnce({
      json: async () => ({
        status: 'success',
        data: [],
      }),
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
