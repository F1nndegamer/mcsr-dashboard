import React, { useEffect, useState } from "react";
import { formatClock } from "./overlayStats";
// The scene shell renders existing overlay pieces verbatim: the status pill
// and the progress bar come from the base theme in StreamStatsOverlay.css
// (imported here so a scene never depends on the stats overlay component
// being loaded).
import "./StreamStatsOverlay.css";
import "./StreamSceneOverlay.css";

/**
 * Ticks `totalSeconds` down to zero once per second (null => no countdown).
 * Drives from the wall clock so a paused/throttled OBS source stays accurate.
 */
const useCountdown = (totalSeconds) => {
  const [remaining, setRemaining] = useState(totalSeconds ?? null);

  useEffect(() => {
    if (totalSeconds == null) {
      setRemaining(null);
      return undefined;
    }

    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);
      return left;
    };

    setRemaining(tick());

    const intervalId = window.setInterval(() => {
      if (tick() === 0) window.clearInterval(intervalId);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [totalSeconds]);

  return remaining;
};

/**
 * Shared 1920x1080 scene shell for the full-screen OBS scenes.
 *
 * Reuses the stats overlay's visual language: the same header rule, the same
 * status pill (mcsr-overlay__status--*), the same progress bar as the
 * countdown track, and the same stat-tile treatment for info cards.
 */
const StreamSceneOverlay = ({
  ariaLabel,
  title,
  headline,
  subtitle = null,
  countdownSeconds = null,
  countdownLabel = "COUNTDOWN",
  countdownDoneLabel = "NOW",
  status = "syncing",
  statusLabel,
  children = null,
  footer = null,
}) => {
  const remaining = useCountdown(countdownSeconds);
  const showCountdown = countdownSeconds != null && remaining != null;
  const isDone = showCountdown && remaining <= 0;
  // The bar fills as time elapses, hitting 100% exactly at zero.
  const progressPercent =
    showCountdown && countdownSeconds > 0
      ? Math.max(
          0,
          Math.min(100, ((countdownSeconds - remaining) / countdownSeconds) * 100),
        )
      : 0;

  return (
    <div className="mcsr-scene-root">
      <section className="mcsr-scene" aria-label={ariaLabel}>
        <header className="mcsr-scene__header">
          <h1 className="mcsr-scene__title">{title}</h1>
          <span
            className={`mcsr-overlay__status mcsr-overlay__status--${status}`}
          >
            {statusLabel}
          </span>
        </header>

        <div className="mcsr-scene__body">
          <p className="mcsr-scene__headline">{headline}</p>
          {subtitle ? (
            <p className="mcsr-scene__subtitle">{subtitle}</p>
          ) : null}

          {showCountdown ? (
            <div className="mcsr-scene__countdown">
              <span className="mcsr-scene__countdown-label">
                {isDone ? countdownDoneLabel : countdownLabel}
              </span>
              <span className="mcsr-scene__countdown-value">
                {formatClock(remaining * 1000)}
              </span>
            </div>
          ) : null}

          {showCountdown ? (
            <div
              className="mcsr-overlay__progress-track mcsr-scene__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={countdownSeconds}
              aria-valuenow={remaining}
              aria-label={countdownLabel}
            >
              <div
                className="mcsr-overlay__progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          ) : null}

          {children}
        </div>

        {footer ? (
          <footer className="mcsr-scene__footer">{footer}</footer>
        ) : null}
      </section>
    </div>
  );
};

export default StreamSceneOverlay;
