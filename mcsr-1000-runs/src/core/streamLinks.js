/**
 * Stream link resolution: builds the Twitch / YouTube channel URLs and - when
 * a YouTube Data API v3 key is configured - looks up the channel's latest
 * upload so the sheet's "Latest VOD" link stays current on every sync.
 *
 * Dependency-free (global fetch), fully injectable (`fetchImpl`) for tests,
 * and deliberately best-effort: a missing key, a rate limit or an offline
 * machine must never fail a sync - the helper just returns null and the block
 * is written without the VOD row.
 */

const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";
const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";

/** Strips a leading @ so both "@name" and "name" env values work. */
const normaliseHandle = (handle) => String(handle ?? "").trim().replace(/^@/, "");

/** Builds the canonical channel URLs; empty string when a handle is missing. */
export const buildStreamUrls = ({ twitchHandle = "", youtubeHandle = "" } = {}) => {
  const twitch = normaliseHandle(twitchHandle);
  const youtube = normaliseHandle(youtubeHandle);
  return {
    twitchUrl: twitch ? `https://twitch.tv/${twitch}` : "",
    youtubeUrl: youtube ? `https://www.youtube.com/@${youtube}` : "",
  };
};

/**
 * Returns the channel's most recent upload as a watch URL, or null.
 *
 * Flow: channels.list(forHandle) -> relatedPlaylists.uploads ->
 * playlistItems.list(maxResults=1) -> videoId. The uploads playlist is
 * newest-first, so a single page is authoritative - no pagination needed.
 */
export const fetchLatestYouTubeVodUrl = async ({
  apiKey,
  handle,
  fetchImpl = globalThis.fetch,
  logger,
  timeoutMs = 5000,
} = {}) => {
  const normalised = normaliseHandle(handle);
  if (!apiKey || !normalised || typeof fetchImpl !== "function") return null;

  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const request = (url) => fetchImpl(url, signal ? { signal } : undefined);

  try {
    const channelsResponse = await request(
      `${CHANNELS_URL}?part=contentDetails&forHandle=@${encodeURIComponent(normalised)}&key=${encodeURIComponent(apiKey)}`,
    );
    if (!channelsResponse.ok) {
      throw new Error(`channels.list responded ${channelsResponse.status}`);
    }
    const channelsPayload = await channelsResponse.json();
    const uploadsPlaylist =
      channelsPayload?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) {
      // Not a channel / handle not found: nothing to link, not an error.
      return null;
    }

    const itemsResponse = await request(
      `${PLAYLIST_ITEMS_URL}?part=contentDetails&playlistId=${encodeURIComponent(uploadsPlaylist)}&maxResults=1&key=${encodeURIComponent(apiKey)}`,
    );
    if (!itemsResponse.ok) {
      throw new Error(`playlistItems.list responded ${itemsResponse.status}`);
    }
    const itemsPayload = await itemsResponse.json();
    const videoId = itemsPayload?.items?.[0]?.contentDetails?.videoId;
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
  } catch (error) {
    logger?.warn?.(`YouTube VOD lookup failed: ${error.message}`);
    return null;
  }
};

/**
 * Resolves everything the Stream block needs from the loaded config.
 * `stream` is `config.stream` (may be undefined on partial test configs).
 */
export const resolveStreamLinks = async ({
  stream,
  player = "",
  fetchImpl = globalThis.fetch,
  logger,
} = {}) => {
  const twitchHandle = normaliseHandle(stream?.twitchHandle) || normaliseHandle(player);
  const youtubeHandle = normaliseHandle(stream?.youtubeHandle) || normaliseHandle(player);
  const { twitchUrl, youtubeUrl } = buildStreamUrls({ twitchHandle, youtubeHandle });

  const vodUrl = stream?.youtubeApiKey
    ? await fetchLatestYouTubeVodUrl({
        apiKey: stream.youtubeApiKey,
        handle: youtubeHandle,
        fetchImpl,
        logger,
      })
    : null;

  return { twitchUrl, youtubeUrl, vodUrl };
};
