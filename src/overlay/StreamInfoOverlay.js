import React, { useMemo } from 'react';
import { Monitor, Clock, Youtube, Twitch } from 'lucide-react';
import { resolveOverlayConfig } from './overlayConfig';
import './StreamInfoOverlay.css';

const DEFAULT_TWITCH_HANDLE = 'AwenRuns';
const DEFAULT_YOUTUBE_HANDLE = 'AwenRuns';

/**
 * Small live-feed status renderer for the stream info tile.
 *
 * Mirrors the same status pill markup and CSS classes the main overlay uses so
 * the two stay consistent when projected side by side in OBS.
 */
const StatusPill = ({ status, label }) => {
  const tone =
    status === 'online'
      ? 'mcsr-overlay__status--live'
      : status === 'offline'
      ? 'mcsr-overlay__status--offline'
      : 'mcsr-overlay__status--syncing';

  return (
    <span className={`mcsr-overlay__status ${tone}`}>
      {label ?? (status === 'online' ? 'LIVE' : status === 'offline' ? 'OFFLINE' : 'SYNCING...')}
    </span>
  );
};

/**
 * Builds a Twitch.tv URL, falling back to null when there's no handle.
 */
const twitchUrl = (handle) => (handle ? `https://twitch.tv/${handle}` : null);

/**
 * Builds a YouTube channel URL, falling back to null when there's no handle.
 */
const youtubeUrl = (handle) => (handle ? `https://www.youtube.com/@${handle}` : null);

const StreamInfoTile = ({
  twitchHandle = DEFAULT_TWITCH_HANDLE,
  youtubeHandle = DEFAULT_YOUTUBE_HANDLE,
  status = 'offline',
  statusLabel,
  twitchUrl: customTwitchUrl,
  youtubeUrl: customYoutubeUrl,
  streamUrl,
}) => {
  useMemo(() => resolveOverlayConfig(), []);

  const twitchResolved = customTwitchUrl || twitchUrl(twitchHandle);
  const youtubeResolved = customYoutubeUrl || youtubeUrl(youtubeHandle);
  const watchUrl = streamUrl || null;

  return (
    <div className="mcsr-overlay__stat mcsr-overlay__stat--stream">
      <div className="mcsr-overlay__stat-label mcsr-overlay__stat-label--stream">Stream</div>

      <div className="mcsr-overlay__stat-body">
        <div className="mcsr-overlay__stat-row">
          <div className="mcsr-overlay__stat-icon mcsr-overlay__stat-icon--twitch">
            <Twitch size={14} />
          </div>
          <div className="mcsr-overlay__stat-text">
            <div className="mcsr-overlay__stat-topline">Twitch</div>
            <div className="mcsr-overlay__stat-detail">
              <a
                href={twitchResolved}
                target="_blank"
                rel="noopener noreferrer"
                className="mcsr-overlay__stat-value mcsr-overlay__stat-value--twitch"
              >
                {twitchHandle}
              </a>
            </div>
          </div>
        </div>

        <div className="mcsr-overlay__stat-row">
          <div className="mcsr-overlay__stat-icon mcsr-overlay__stat-icon--youtube">
            <Youtube size={14} />
          </div>
          <div className="mcsr-overlay__stat-text">
            <div className="mcsr-overlay__stat-topline">YouTube</div>
            <div className="mcsr-overlay__stat-detail">
              <a
                href={youtubeResolved}
                target="_blank"
                rel="noopener noreferrer"
                className="mcsr-overlay__stat-value mcsr-overlay__stat-value--youtube"
              >
                {youtubeHandle}
              </a>
            </div>
          </div>
        </div>

        {watchUrl && (
          <div className="mcsr-overlay__stat-row mcsr-overlay__stat-row--watch">
            <div className="mcsr-overlay__stat-icon mcsr-overlay__stat-icon--watch">
              <Monitor size={14} />
            </div>
            <div className="mcsr-overlay__stat-text">
              <div className="mcsr-overlay__stat-topline">Watch / VOD</div>
              <div className="mcsr-overlay__stat-detail mcsr-overlay__stat-detail--watch">
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mcsr-overlay__stat-value mcsr-overlay__stat-value--watch"
                >
                  {watchUrl}
                </a>
              </div>
            </div>
          </div>
        )}

        <div className="mcsr-overlay__stat-row mcsr-overlay__stat-row--clock">
          <div className="mcsr-overlay__stat-icon mcsr-overlay__stat-icon--clock">
            <Clock size={14} />
          </div>
          <div className="mcsr-overlay__stat-text">
            <div className="mcsr-overlay__stat-topline">Status</div>
            <div className="mcsr-overlay__stat-detail">
              <StatusPill status={status} label={statusLabel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamInfoTile;
