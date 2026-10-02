import React, { useEffect, useMemo, useState } from "react";
import {
  API_BASE,
  RANKED_MATCH_TYPE,
  fetchAllRankedMatches,
} from "../api/mcsrApi";
import { resolveOverlayConfig } from "./overlayConfig";
import {
  computeOverlayStats,
  formatDuration,
  formatEloDelta,
  getUtcStartOfTodaySeconds,
} from "./overlayStats";
import "./StreamStatsOverlay.css";

const StatTile = ({ label, value, tone = "default", hint }) => (
  <div className="mcsr-overlay__stat">
    <span className="mcsr-overlay__stat-label">{label}</span>
    <span className={`mcsr-overlay__stat-value mcsr-overlay__stat-value--${tone}`}>
      {value}
    </span>
    {hint ? <span className="mcsr-overlay__stat-hint">{hint}</span> : null}
  </div>
);

const StreamStatsOverlay = () => {
  const config = useMemo(() => resolveOverlayConfig(), []);

  const [profile, setProfile] = useState(null);
  const [allMatches, setAllMatches] = useState(() => new Map());
  const [hasFullHistory, setHasFullHistory] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  const sessionStart = useMemo(
    () => config.sessionStartEpochSeconds ?? getUtcStartOfTodaySeconds(),
    [config.sessionStartEpochSeconds],
  );

  useEffect(() => {
    let cancelled = false;

    const mergeMatches = (list) => {
      if (!Array.isArray(list) || list.length === 0) return;
      setAllMatches((previous) => {
        const next = new Map(previous);
        list.forEach((match) => {
          if (match?.id != null) next.set(match.id, match);
        });
        return next;
      });
    };

    const pollStats = async () => {
      try {
        const [userResponse, recentResponse] = await Promise.all([
          fetch(`${API_BASE}/users/${config.username}`),
          fetch(
            `${API_BASE}/users/${config.username}/matches?count=100&sort=newest&type=${RANKED_MATCH_TYPE}`,
          ),
        ]);

        const [userData, recentData] = await Promise.all([
          userResponse.json(),
          recentResponse.json(),
        ]);

        if (userData.status !== "success" || !userData.data) {
          throw new Error("Could not load user profile from API.");
        }

        if (
          recentData.status !== "success" ||
          !Array.isArray(recentData.data)
        ) {
          throw new Error("Could not load recent matches from API.");
        }

        if (cancelled) return;

        setProfile(userData.data);
        mergeMatches(recentData.data);
        setIsOffline(false);
      } catch (pollError) {
        if (cancelled) return;
        // Keep the last known-good stats on screen; never blank the overlay.
        console.warn(
          "[mcsr-overlay] Poll failed, keeping last known stats.",
          pollError,
        );
        setIsOffline(true);
      } finally {
        if (!cancelled) setIsSyncing(false);
      }
    };

    const loadFullHistory = async () => {
      try {
        const history = await fetchAllRankedMatches(config.username);
        if (cancelled) return;
        mergeMatches(history);
        setHasFullHistory(true);
      } catch (historyError) {
        if (cancelled) return;
        console.warn(
          "[mcsr-overlay] Could not load full history for overall average.",
          historyError,
        );
      }
    };

    pollStats();
    loadFullHistory();

    const intervalId = window.setInterval(pollStats, config.pollIntervalMs);

    return () => {
      cancelled = true;

  const stats = useMemo(
    () =>
      computeOverlayStats({
        profile,
        matches: allMatches,
        sessionStart,
        hasFullHistory,
      }),
    [profile, allMatches, sessionStart, hasFullHistory],
  );

  const progressPercent =
    config.goalRuns > 0
      ? Math.min(100, (config.totalSpeedruns / config.goalRuns) * 100)
      : 0;

  const statusClass = isOffline
    ? "mcsr-overlay__status--offline"
    : isSyncing
      ? "mcsr-overlay__status--syncing"
      : "mcsr-overlay__status--live";
  const statusLabel = isOffline
    ? "RECONNECTING..."
    : isSyncing
      ? "SYNCING..."
      : "LIVE";

  const eloTodayTone =
    stats.eloDeltaToday > 0
      ? "positive"
      : stats.eloDeltaToday < 0
        ? "negative"
        : "neutral";

  return (
    <div className="mcsr-overlay-root">
      <section className="mcsr-overlay" aria-label="Stream statistics overlay">
        <header className="mcsr-overlay__header">
          <h1 className="mcsr-overlay__title">{config.title}</h1>
          <span className={`mcsr-overlay__status ${statusClass}`}>
            {statusLabel}
          </span>
        </header>

        <div className="mcsr-overlay__progress">
          <div className="mcsr-overlay__progress-header">
            <span className="mcsr-overlay__progress-label">
              Runs Completed
            </span>
            <span className="mcsr-overlay__progress-count">
              {config.totalSpeedruns} / {config.goalRuns}
              <span className="mcsr-overlay__progress-percent">
                {" "}
                ({progressPercent.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div
            className="mcsr-overlay__progress-track"
            role="progressbar"
            aria-valuenow={config.totalSpeedruns}
            aria-valuemin={0}
            aria-valuemax={config.goalRuns}
            aria-label="Progress towards goal runs"
          >
            <div
              className="mcsr-overlay__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="mcsr-overlay__grid">
          <StatTile
            label="Total Speedruns"
            value={config.totalSpeedruns}
            tone="accent"
            hint="LOCAL"
          />
          <StatTile
            label="Runs Today"
            value={profile ? stats.runsToday : "—"}
            hint="SINCE TODAY 00:00 UTC"
          />
          <StatTile
            label="Current ELO"
            value={stats.currentElo ?? "—"}
            tone="accent"
            hint="RANKED API"
          />
          <StatTile
            label="ELO Diff Today"
            value={profile ? formatEloDelta(stats.eloDeltaToday) : "—"}
            tone={eloTodayTone}
            hint="THIS SESSION"
          />
          <StatTile
            label="Avg Match Time"
            value={
              stats.overallAvgTime == null
                ? hasFullHistory
                  ? "—"
                  : "LOADING..."
                : formatDuration(stats.overallAvgTime)
            }
            hint="ALL-TIME"
          />
          <StatTile
            label="Avg Match Time"
            value={
              stats.todayAvgTime == null
                ? "—"
                : formatDuration(stats.todayAvgTime)
            }
            hint="TODAY"
          />
        </div>
      </section>
    </div>
  );
};

export default StreamStatsOverlay;

      window.clearInterval(intervalId);
    };
  }, [config.username, config.pollIntervalMs]);
