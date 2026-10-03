import { TARGET_RUNS } from "../models/constants.js";

/**
 * Dashboard layout.
 *
 * Everything is a live formula over the Runs sheet, so the dashboard never
 * needs its own sync logic. It is deliberately simple - the Runs sheet is the
 * primary dataset and the dashboard must never block a sync.
 */

const TIMED = "ISNUMBER(Runs!$U$2:$U)";

export const dashboardBuild = ({ capacity = 2500 } = {}) => {
  const statFormulas = [
    [`Completed Runs / ${TARGET_RUNS}`, `=IFERROR(COUNTIF(Runs!$G$2:$G, "WIN"), 0)`],
    ["Progress %", `=IFERROR(B7/${TARGET_RUNS}, 0)`],
    ["Total Matches", `=IFERROR(COUNTA(Runs!$C$2:$C), 0)`],
    ["Wins", `=IFERROR(COUNTIF(Runs!$G$2:$G, "WIN"), 0)`],
    ["Losses", `=IFERROR(COUNTIF(Runs!$G$2:$G, "LOSS"), 0)`],
    ["Draws", `=IFERROR(COUNTIF(Runs!$G$2:$G, "DRAW"), 0)`],
    ["Forfeits", `=IFERROR(COUNTIF(Runs!$G$2:$G, "FORFEIT"), 0)`],
    ["PB", `=IFERROR(MIN(FILTER(Runs!$U$2:$U, ${TIMED})), "")`],
    ["Average Final Time", `=IFERROR(AVERAGE(FILTER(Runs!$U$2:$U, ${TIMED})), "")`],
    ["Median Final Time", `=IFERROR(MEDIAN(FILTER(Runs!$U$2:$U, ${TIMED})), "")`],
    ["Completed runs with a time", `=IFERROR(COUNT(Runs!$U$2:$U), 0)`],
    ["Rows still needing input", `=IFERROR(COUNTIF(Runs!$AB$2:$AB, "NEEDS INPUT"), 0)`],
  ];

  const headerRowIndex = 6;
  const firstStatRow = 7;
  const chartHeaderRow = firstStatRow + statFormulas.length + 1;

  /** A1 grid written with USER_ENTERED so formulas evaluate. */
  const grid = [
    ["MCSR Ranked 1000 Runs", ""],
    ["Tracked player", "{player}"],
    ["Start date", "{startDate}"],
    ["Last synced", "{lastSynced}"],
    [""],
    ["Metric", "Value"],
    ...statFormulas.map(([label, formula]) => [label, formula]),
    [""],
    ["Run #", "Final Time", "Rolling Avg (10)", "PB so far"],
  ];

  // Derive the concrete row for each stat so number formats can never drift
  // out of sync with the grid above.
  const statRow = (label) => {
    const index = grid.findIndex((row) => row[0] === label);
    return index === -1 ? null : index + 1;
  };

  return {
    headerRowIndex,
    firstStatRow,
    chartHeaderRow,
    chartFirstRow: chartHeaderRow + 1,
    grid,
    // Per-row chart helper formulas. A20:B20 spill from FILTER, so C/D only
    // need their own per-row formulas.
    chartColumns: {
      runNumber: `=IFERROR(FILTER(Runs!$A$2:$A, ${TIMED}), "")`,
      finalTime: `=IFERROR(FILTER(Runs!$U$2:$U, ${TIMED}), "")`,
      rollingAverage: (row) =>
        `=IFERROR(IF($A${row}="","",AVERAGEIFS(Runs!$U$2:$U, Runs!$A$2:$A,">="&($A${row}-9), Runs!$A$2:$A,"<="&$A${row})),"")`,
      progressivePb: (row) =>
        `=IFERROR(IF($A${row}="","",MINIFS(Runs!$U$2:$U, Runs!$A$2:$A,"<="&$A${row})),"")`,
    },
    chartRowCapacity: Math.max(50, capacity - 2),
    /** Rows that need a percentage / duration number format. */
    formatRows: [
      { row: statRow("Progress %"), type: "PERCENT", pattern: "0.0%" },
      { row: statRow("PB"), type: "TIME", pattern: "[h]:mm:ss.000" },
      { row: statRow("Average Final Time"), type: "TIME", pattern: "[h]:mm:ss.000" },
      { row: statRow("Median Final Time"), type: "TIME", pattern: "[h]:mm:ss.000" },
    ].filter((entry) => entry.row !== null),
  };
};
