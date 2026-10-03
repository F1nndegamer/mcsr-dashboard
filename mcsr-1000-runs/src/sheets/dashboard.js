import { TARGET_RUNS } from "../models/constants.js";
import { COLUMN_INDEX, COLUMN_LETTERS } from "../models/runRecord.js";

/**
 * Dashboard layout.
 *
 * Everything is a live formula over the Runs sheet, so the dashboard never
 * needs its own sync logic. It is deliberately simple - the Runs sheet is the
 * primary dataset and the dashboard must never block a sync.
 */

// Derived from the schema so a column re-order can never silently break a
// formula (they used to be hard-coded letters).
const RESULT_COL = COLUMN_LETTERS[COLUMN_INDEX.result];
const MATCH_ID_COL = COLUMN_LETTERS[COLUMN_INDEX.matchId];
const RUN_COL = COLUMN_LETTERS[COLUMN_INDEX.runNumber];
const FINAL_TIME_COL = COLUMN_LETTERS[COLUMN_INDEX.finalTimeMs];
const DATA_STATUS_COL = COLUMN_LETTERS[COLUMN_INDEX.dataStatus];

const TIMED = `ISNUMBER(Runs!$${FINAL_TIME_COL}$2:$${FINAL_TIME_COL})`;
const FINAL = `Runs!$${FINAL_TIME_COL}$2:$${FINAL_TIME_COL}`;

/** Compact ASCII progress bar - the visual focal point of the dashboard. */
const BAR_CELLS = 40;
const progressBarFormula = (targetRow) => {
  const fraction = `MIN(1,IFERROR($B${targetRow}/${TARGET_RUNS},0))`;
  return (
    `=REPT(CHAR(9608),ROUND(${fraction}*${BAR_CELLS},0))` +
    `&REPT(CHAR(9617),${BAR_CELLS}-ROUND(${fraction}*${BAR_CELLS},0))`
  );
};

export const dashboardBuild = ({ capacity = 2500 } = {}) => {
  const statFormulas = [
    [`Completed Runs / ${TARGET_RUNS}`, `=IFERROR(COUNTIF(Runs!$${RESULT_COL}$2:$${RESULT_COL}, "WIN"), 0)`],
    ["Progress %", ""], // wired up below once the grid rows are known
    ["Total Matches", `=IFERROR(COUNTA(Runs!$${MATCH_ID_COL}$2:$${MATCH_ID_COL}), 0)`],
    ["Wins", `=IFERROR(COUNTIF(Runs!$${RESULT_COL}$2:$${RESULT_COL}, "WIN"), 0)`],
    ["Losses", `=IFERROR(COUNTIF(Runs!$${RESULT_COL}$2:$${RESULT_COL}, "LOSS"), 0)`],
    ["Draws", `=IFERROR(COUNTIF(Runs!$${RESULT_COL}$2:$${RESULT_COL}, "DRAW"), 0)`],
    ["Forfeits", `=IFERROR(COUNTIF(Runs!$${RESULT_COL}$2:$${RESULT_COL}, "FORFEIT"), 0)`],
    ["PB", `=IFERROR(MIN(FILTER(${FINAL}, ${TIMED})), "")`],
    ["Average Final Time", `=IFERROR(AVERAGE(FILTER(${FINAL}, ${TIMED})), "")`],
    ["Median Final Time", `=IFERROR(MEDIAN(FILTER(${FINAL}, ${TIMED})), "")`],
    ["Completed runs with a time", `=IFERROR(COUNT(${FINAL}), 0)`],
    ["Rows still needing input", `=IFERROR(COUNTIF(Runs!$${DATA_STATUS_COL}$2:$${DATA_STATUS_COL}, "NEEDS INPUT"), 0)`],
  ];

  const headerRowIndex = 8;
  const firstStatRow = headerRowIndex + 1;
  const chartHeaderRow = firstStatRow + statFormulas.length + 1;

  const completedRunsRow = firstStatRow; // "Completed Runs / 1000" is always the first stat.

  /** A1 grid written with USER_ENTERED so formulas evaluate. */
  const grid = [
    ["MCSR Ranked 1000 Runs", ""],
    ["Tracked player", "{player}"],
    ["Start date", "{startDate}"],
    ["Last synced", "{lastSynced}"],
    [""],
    ["Progress", `=IFERROR($B${completedRunsRow},0)&" / ${TARGET_RUNS} Runs"`],
    ["Progress Bar", progressBarFormula(completedRunsRow)],
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

  // Progress % divides by TARGET_RUNS and must reference the concrete
  // "Completed Runs / 1000" row, which is only known once the grid exists.
  const progressIndex = grid.findIndex((row) => row[0] === "Progress %");
  if (progressIndex !== -1) {
    grid[progressIndex][1] = `=IFERROR($B${completedRunsRow}/${TARGET_RUNS}, 0)`;
  }

  return {
    headerRowIndex,
    firstStatRow,
    chartHeaderRow,
    chartFirstRow: chartHeaderRow + 1,
    progressRow: statRow("Progress"),
    progressBarRow: statRow("Progress Bar"),
    completedRunsRow,
    grid,
    // Per-row chart helper formulas. A20:B20 spill from FILTER, so C/D only
    // need their own per-row formulas.
    chartColumns: {
      runNumber: `=IFERROR(FILTER(Runs!$${RUN_COL}$2:$${RUN_COL}, ${TIMED}), "")`,
      finalTime: `=IFERROR(FILTER(${FINAL}, ${TIMED}), "")`,
      rollingAverage: (row) =>
        `=IFERROR(IF($A${row}="","",AVERAGEIFS(${FINAL}, Runs!$${RUN_COL}$2:$${RUN_COL},">="&($A${row}-9), Runs!$${RUN_COL}$2:$${RUN_COL},"<="&$A${row})),"")`,
      progressivePb: (row) =>
        `=IFERROR(IF($A${row}="","",MINIFS(${FINAL}, Runs!$${RUN_COL}$2:$${RUN_COL},"<="&$A${row})),"")`,
    },
    chartRowCapacity: Math.max(50, capacity - 2),
    /** Rows that need a percentage / duration number format. */
    formatRows: [
      { row: statRow("Progress %"), type: "PERCENT", pattern: "0.0%" },
      { row: statRow("PB"), type: "TIME", pattern: "[mm]:ss.000" },
      { row: statRow("Average Final Time"), type: "TIME", pattern: "[mm]:ss.000" },
      { row: statRow("Median Final Time"), type: "TIME", pattern: "[mm]:ss.000" },
    ].filter((entry) => entry.row !== null),
  };
};
