import React, { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE, RANKED_MATCH_TYPE, fetchAllRankedMatches } from "../api/mcsrApi";
import {
  clearStoredTotalRuns,
  loadStoredTotalRuns,
  resolveOverlayConfig,
  saveStoredTotalRuns,
} from "./overlayConfig";
import {
  computeOverlayStats,
  formatClock,
  formatEloDelta,
  getUtcStartOfTodaySeconds,
} from "./overlayStats";
import "./StreamStatsOverlay.css";

const StatTile = ({ label, value, tone = "default", graph = null }) => {
  const valueNode = (
    <span
      className={`mcsr-overlay__stat-value mcsr-overlay__stat-value--${tone}`}
    >
      {value}
    </span>
  );

  if (graph) {
    return (
      <div className="mcsr-overlay__stat mcsr-overlay__stat--graph">
        <div className="mcsr-overlay__stat-side">
          <span className="mcsr-overlay__stat-label">{label}</span>
          {valueNode}
        </div>
        <div className="mcsr-overlay__stat-graph">{graph}</div>
      </div>
    );
  }

  return (
    <div className="mcsr-overlay__stat">
      <span className="mcsr-overlay__stat-label">{label}</span>
      {valueNode}
    </div>
  );
};

const EloSparkline = ({ series, netChange }) => {
  const safeSeries = series && series.length > 0 ? series : [0];
  let min = Math.min(0, ...safeSeries);
  let max = Math.max(0, ...safeSeries);
  // Flat series (no runs today): center the baseline instead of pinning it
  // to the bottom edge of the graph.
  if (min === max) {
    min = -1;
    max = 1;
  }
  const range = max - min || 1;
  const pad = 8; // viewBox units

  const toY = (value) => pad + (1 - (value - min) / range) * (100 - pad * 2);

  const coords =
    safeSeries.length > 1
      ? safeSeries.map((value, index) => ({
          x: (index / (safeSeries.length - 1)) * 100,
          y: toY(value),
        }))
      : [
          { x: 0, y: toY(safeSeries[0]) },
          { x: 100, y: toY(safeSeries[0]) },
        ];

  const points = coords
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const zeroY = toY(0);
  const tone =
    netChange > 0 ? "positive" : netChange < 0 ? "negative" : "neutral";
  const areaPoints = `0,${zeroY.toFixed(2)} ${points} 100,${zeroY.toFixed(2)}`;

  return (
    <svg
      className={`mcsr-overlay__elo-graph mcsr-overlay__elo-graph--${tone}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="ELO change today graph"
    >
      <polygon
        points={areaPoints}
        className="mcsr-overlay__elo-graph-area"
      />
      <line
        x1="0"
        y1={zeroY}
        x2="100"
        y2={zeroY}
        className="mcsr-overlay__elo-graph-zero"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points}
        className="mcsr-overlay__elo-graph-line"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

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

    // One-time crawl on mount so the all-time average is accurate.
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
          <div className="mcsr-overlay__header-right">
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
            <span className={`mcsr-overlay__status ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        </header>

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

        <div className="mcsr-overlay__grid">
          <StatTile
            label="Runs Today"
            value={profile ? stats.runsToday : "—"}
          />
          <StatTile
            label="Current ELO"
            value={stats.currentElo ?? "—"}
            tone="accent"
          />
          <StatTile
            label="ELO Change Today"
            value={profile ? formatEloDelta(stats.eloDeltaToday) : "—"}
            tone={eloTodayTone}
            graph={
              <EloSparkline
                series={stats.eloSeries}
                netChange={stats.eloDeltaToday}
              />
            }
          />
          <StatTile
            label="Avg Match Time"
            value={
              stats.overallAvgTime == null
                ? hasFullHistory
                  ? "—"
                  : "…"
                : formatClock(stats.overallAvgTime)
            }
          />
          <StatTile
            label="Avg Match Time (Today)"
            value={
              stats.todayAvgTime == null
                ? "—"
                : formatClock(stats.todayAvgTime)
            }
          />
          <StatTile
            label="Personal Best"
            value={
              stats.personalBest == null ? "—" : formatClock(stats.personalBest)
            }
            tone="accent"
          />
        </div>
      </section>
    </div>
  );
};

export default StreamStatsOverlay;

