/**
 * MCSR Ranked adapter for the 1000-run tracker.
 *
 * REUSE: this module imports the existing browser client in this repository
 * (`src/api/mcsrApi.js`) and re-exports its constants, plus delegates the
 * "all ranked matches" listing to its `fetchAllRankedMatches`.
 *
 * The existing client could not be used as-is for the tracker because it
 *   * cannot pass `season` (the MCSR list endpoint is season-filtered by
 *     default, so it only ever sees the current season),
 *   * has no advanced `GET /matches/{id}` support (timelines/completions),
 *   * has no Private-Key header, retry or backoff handling,
 *   * mutates the page cursor without date awareness.
 * This adapter therefore generalises the same pagination contract
 * (`count=100`, `sort=oldest`, `after=<last match id>`, `status === "success"`)
 * instead of duplicating it verbatim.
 */
import {
  API_BASE,
  DEFAULT_USER,
  MATCHES_PAGE_SIZE,
  MAX_RANKED_PAGES,
  RANKED_MATCH_TYPE,
} from "../../../src/api/mcsrApi.js";

export { API_BASE, DEFAULT_USER, MATCHES_PAGE_SIZE, MAX_RANKED_PAGES, RANKED_MATCH_TYPE };

export class McsrApiError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = "McsrApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export const isRateLimitError = (error) =>
  error instanceof McsrApiError && error.status === 429;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class McsrApiClient {
  constructor({
    baseUrl = API_BASE,
    privateKey = "",
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    maxRetries = 4,
    baseBackoffMs = 600,
    logger = console,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.privateKey = privateKey;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.maxRetries = maxRetries;
    this.baseBackoffMs = baseBackoffMs;
    this.logger = logger;
  }

  buildUrl(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /**
   * Performs a request with retry + exponential backoff.
   * Retries HTTP 429 and 5xx, and network errors. Never retries 4xx (other
   * than 429) because those are deterministic.
   */
  async request(path, { params = {}, allowNotFound = false } = {}) {
    const url = this.buildUrl(path, params);
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoff = this.baseBackoffMs * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * 250);
        this.logger.warn?.(`Retrying ${path} (attempt ${attempt + 1}) in ${backoff + jitter}ms`);
        await this.sleep(backoff + jitter);
      }

      let response;
      try {
        const headers = { Accept: "application/json" };
        if (this.privateKey) headers["Private-Key"] = this.privateKey;
        response = await this.fetchImpl(url, { headers });
      } catch (error) {
        lastError = error;
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number.parseInt(response.headers?.get?.("retry-after") ?? "", 10);
        if (Number.isFinite(retryAfter) && retryAfter > 0) await this.sleep(retryAfter * 1000);
        lastError = new McsrApiError(
          `MCSR API responded ${response.status} for ${path}`,
          { status: response.status, url },
        );
        continue;
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new McsrApiError(`MCSR API returned invalid JSON for ${path}`, {
          status: response.status,
          url,
        });
      }

      if (payload?.status === "success") return payload.data;

      const message =
        typeof payload?.data === "string" ? payload.data : `MCSR API status "${payload?.status}"`;
      const error = new McsrApiError(`${message} (${path})`, {
        status: response.status,
        body: payload,
        url,
      });

      if (allowNotFound && response.status === 400) return null;
      if (response.status === 401) {
        throw new McsrApiError(
          `MCSR API rejected the request parameters: ${message}`,
          { status: 401, body: payload, url },
        );
      }
      throw error;
    }

    throw lastError instanceof McsrApiError
      ? lastError
      : new McsrApiError(`MCSR API request failed after retries: ${path}`, { url });
  }
  /** GET /users/{identifier} - used to resolve the tracked player's uuid. */
  async getUser(identifier) {
    const data = await this.request(`/users/${encodeURIComponent(identifier)}`);
    if (!data || !data.uuid) {
      throw new McsrApiError(`User "${identifier}" could not be resolved.`);
    }
    return data;
  }

  /**
   * One page of a user's matches.
   * Mirrors the pagination contract of the existing client in `src/api/mcsrApi.js`.
   */
  async listUserMatches({
    identifier,
    season,
    sort = "oldest",
    count = MATCHES_PAGE_SIZE,
    after,
    type = RANKED_MATCH_TYPE,
    excludeDecayed = true,
  } = {}) {
    const params = { count, sort, type, season, after };
    if (excludeDecayed) params.excludedecay = "true";
    const data = await this.request(`/users/${encodeURIComponent(identifier)}/matches`, { params });
    if (data === null) return [];
    if (!Array.isArray(data)) {
      throw new McsrApiError(`Unexpected match list payload for "${identifier}".`);
    }
    return data;
  }

  /** Paginates a single season until exhausted (same loop as the existing client). */
  async fetchSeasonMatches({ identifier, season, sort = "oldest", excludeDecayed = true }) {
    const matches = [];
    let after;

    for (let page = 0; page < MAX_RANKED_PAGES; page += 1) {
      const pageMatches = await this.listUserMatches({
        identifier,
        season,
        sort,
        count: MATCHES_PAGE_SIZE,
        after,
        excludeDecayed,
      });

      if (pageMatches.length === 0) break;
      matches.push(...pageMatches);

      if (pageMatches.length < MATCHES_PAGE_SIZE) break;

      const lastId = pageMatches[pageMatches.length - 1]?.id;
      if (!lastId || lastId === after) {
        this.logger.warn?.(`Pagination cursor stalled at match ${lastId}; stopping page loop.`);
        break;
      }
      after = lastId;
    }

    return matches;
  }

  /** GET /matches/{match_id} - advanced payload (timelines, completions, ...). */
  async fetchMatch(matchId) {
    return this.request(`/matches/${encodeURIComponent(matchId)}`, { allowNotFound: true });
  }

  /** GET /leaderboard?season=N - season window metadata (startsAt/endsAt/number). */
  async fetchSeasonInfo(season) {
    const data = await this.request(`/leaderboard`, { params: season ? { season } : {} });
    return data?.season ?? null;
  }
}

/**
 * Decides which MCSR seasons can contain matches on/after `startDateMs`.
 *
 * The MCSR match list is season-filtered by default, and matches played in the
 * gap between two seasons are labelled with the UPCOMING season number, so we
 * walk seasons downwards from the current one until we reach a season that
 * started on or before START_DATE (that season still gets scanned), then stop.
 * `lookback` adds extra seasons as a safety margin.
 *
 * @returns {Promise<number[]>} season numbers, newest first
 */
export const planSeasons = async ({
  client,
  startDateMs,
  maxSeasons = 30,
  lookback = 0,
} = {}) => {
  const seasons = [];
  const current = await client.fetchSeasonInfo();
  if (!current || typeof current.number !== "number") return seasons;

  let season = current.number;
  for (let i = 0; i < maxSeasons && season >= 1; i += 1) {
    seasons.push(season);
    const info = season === current.number ? current : await client.fetchSeasonInfo(season);
    const startsAtMs = (info?.startsAt ?? 0) * 1000;
    if (startDateMs === null || startsAtMs <= startDateMs) break;
    season -= 1;
  }

  for (let i = 0; i < lookback && season > 1; i += 1) {
    season -= 1;
    if (!seasons.includes(season)) seasons.push(season);
  }

  return seasons;
};

