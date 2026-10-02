import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_BASE,
  RANKED_MATCH_TYPE,
  fetchAllRankedMatches,
} from "../api/mcsrApi";
import {
  clearStoredTotalRuns,
  loadStoredTotalRuns,
  resolveOverlayConfig,
  saveStoredTotalRuns,
} from "./overlayConfig";
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
  // URL ?total= is the base; a localStorage override (hotkey/button edits)
  // wins until it is reset or the base changes.
  const [totalRuns, setTotalRuns] = useState(
    () => loadStoredTotalRuns(config.totalSpeedruns) ?? config.totalSpeedruns,
  );

  const sessionStart = useMemo(
    () => config.sessionStartEpochSeconds ?? getUtcStartOfTodaySeconds(),
    [config.sessionStartEpochSeconds],
  );

  const changeTotalRuns = useCallback((delta) => {
    setTotalRuns((previous) => Math.max(0, previous + delta));
  }, []);

  const resetTotalRuns = useCallback(() => {
    setTotalRuns(config.totalSpeedruns);
  }, [config.totalSpeedruns]);

  // Persist hotkey/button edits so they survive OBS source reloads.
  // Equal-to-base means "no local edit" -> drop the stored override.
  useEffect(() => {
    if (totalRuns === config.totalSpeedruns) {
      clearStoredTotalRuns();
    } else {
      saveStoredTotalRuns(totalRuns, config.totalSpeedruns);
    }
  }, [totalRuns, config.totalSpeedruns]);

  // Hotkeys (use OBS's "Interact" window): ↑/+ add, ↓/- subtract,
  // Backspace/Delete reset to the URL ?total= base.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "ArrowUp" || event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeTotalRuns(1);
      } else if (
        event.key === "ArrowDown" ||
        event.key === "-" ||
        event.key === "_"
      ) {
        event.preventDefault();
        changeTotalRuns(-1);
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        resetTotalRuns();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeTotalRuns, resetTotalRuns]);

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
      window.clearInterval(intervalId);
    };
  }, [config.username, config.pollIntervalMs]);

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
      ? Math.min(100, (totalRuns / config.goalRuns) * 100)
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
            <div className="mcsr-overlay__progress-right">
              <span className="mcsr-overlay__progress-count">
                {totalRuns} / {config.goalRuns}
                <span className="mcsr-overlay__progress-percent">
                  {" "}
                  ({progressPercent.toFixed(1)}%)
                </span>
              </span>
              {config.showControls ? (
                <div className="mcsr-overlay__controls">
                  <button
                    type="button"
                    className="mcsr-overlay__control"
                    aria-label="Decrease runs completed"
                    title="Decrease (↓)"
                    onClick={() => changeTotalRuns(-1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="mcsr-overlay__control"
                    aria-label="Increase runs completed"
                    title="Increase (↑)"
                    onClick={() => changeTotalRuns(1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="mcsr-overlay__control"
                    aria-label="Reset runs completed"
                    title="Reset to ?total= base (Backspace)"
                    onClick={resetTotalRuns}
                  >
                    ⟳
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div
            className="mcsr-overlay__progress-track"
            role="progressbar"
            aria-valuenow={totalRuns}
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
            value={totalRuns}
            tone="accent"
            hint="LOCAL"
          />
          <StatTile
            label="Runs Today"
            value={profile ? stats.runsToday : "—"}
            hint="SINCE 00:00 UTC"
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

