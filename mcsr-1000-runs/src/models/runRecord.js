import {
  COMPLETION_FORMULA_TEMPLATE,
  COMPLETION_TYPES,
  MANUAL_FIELDS,
  NOT_APPLICABLE,
} from "./constants.js";

/**
 * Normalised record + the single source of truth for the Runs sheet schema.
 *
 * Column order below is the exact schema requested for the Runs sheet.
 * `type` drives serialisation:
 *   int | text | bool | datetime | duration | formula
 *   manualInt | manualText | manualCompletion  -> user-owned
 *   apiSeededInt -> auto-filled from the API (death count), then user-owned:
 *     sync writes it only when the sheet cell is empty
 *
 * Death handling: `Deaths` is auto-seeded from `projectelo.timeline.death`
 * entries (one per real death; `death_spawnpoint` is a spawn-set event and is
 * explicitly NOT counted). Once the sheet has a value - auto-seeded or typed
 * by the user - sync never overwrites it.
 *
 * @typedef {Object} MCSRRunRecord
 * @property {number} [runNumber]        sequential index of qualifying runs
 * @property {number} matchNumber        sequential index of imported matches
 * @property {number} matchId            MCSR match id (dedup key)
 * @property {number} dateMs             match start, epoch ms
 * @property {number} season             MCSR ranked season
 * @property {string} opponent           opponent nickname
 * @property {"WIN"|"LOSS"|"DRAW"|"FORFEIT"} result
 * @property {boolean} countsToward1000
 * @property {string} [seed]             MCSR *filtered seed id* (not a seed number)
 * @property {string} [seedType]         readable overworld structure type
 * @property {number} [owSplitMs]
 * @property {number} [netherSplitMs]
 * @property {string} [bastionType]
 * @property {number} [bastionTimeMs]
 * @property {number} [endSplitMs]
 * @property {string} [endTowers]        compact display of raw towers
 * @property {-1|0|1} [completionType]   manual
 * @property {string} completion         formula-generated label
 * @property {number} [finalTimeMs]
 * @property {number} [deaths]           API-seeded, then user-owned
 * @property {string} [deathMessages]    manual
 * @property {number} [eloBefore]
 * @property {number} [eloChange]
 * @property {number} [eloAfter]
 * @property {string} [notes]            manual
 * @property {"COMPLETE"|"NEEDS INPUT"} [dataStatus]
 */

export const RUNS_COLUMNS = Object.freeze([
  { key: "runNumber", header: "Run #", type: "int", numberFormat: "0" },
  { key: "matchNumber", header: "Match #", type: "int", numberFormat: "0" },
  { key: "matchId", header: "Match ID", type: "int", numberFormat: "0" },
  { key: "dateMs", header: "Date", type: "datetime", numberFormat: "yyyy-mm-dd hh:mm" },
  { key: "season", header: "Season", type: "int", numberFormat: "0" },
  { key: "opponent", header: "Opponent", type: "text" },
  { key: "result", header: "Result", type: "text" },
  { key: "countsToward1000", header: "Counts Toward 1000", type: "bool" },
  { key: "seed", header: "Seed", type: "text" },
  { key: "seedType", header: "Seed Type", type: "text" },
  { key: "owSplitMs", header: "OW Split", type: "duration", numberFormat: "[mm]:ss.000" },
  { key: "netherSplitMs", header: "Nether Split", type: "duration", numberFormat: "[mm]:ss.000" },
  { key: "bastionType", header: "Bastion Type", type: "text" },
  { key: "bastionTimeMs", header: "Bastion Time", type: "duration", numberFormat: "[mm]:ss.000" },
  { key: "endSplitMs", header: "End Split", type: "duration", numberFormat: "[mm]:ss.000" },
  { key: "endTowers", header: "End Towers", type: "text" },
  { key: "completionType", header: "Completion Type", type: "manualCompletion", numberFormat: "0" },
  { key: "completion", header: "Completion", type: "formula" },
  { key: "finalTimeMs", header: "Final Time", type: "duration", numberFormat: "[mm]:ss.000" },
  { key: "deaths", header: "Deaths", type: "apiSeededInt", numberFormat: "0" },
  { key: "deathMessages", header: "Death Messages", type: "manualText" },
  { key: "eloBefore", header: "Elo Before", type: "int", numberFormat: "0" },
  { key: "eloChange", header: "Elo Change", type: "int", numberFormat: "0" },
  { key: "eloAfter", header: "Elo After", type: "int", numberFormat: "0" },
  { key: "notes", header: "Notes", type: "manualText" },
  { key: "dataStatus", header: "Data Status", type: "text" },
]);

export const COLUMN_COUNT = RUNS_COLUMNS.length;

/** 0-based column index -> A1 notation letters (A, B, ... Z, AA, AB). */
export const columnLetter = (index) => {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
};

export const COLUMN_LETTERS = Object.freeze(RUNS_COLUMNS.map((_, i) => columnLetter(i)));

export const COLUMN_INDEX = Object.freeze(
  RUNS_COLUMNS.reduce((map, column, index) => {
    map[column.key] = index;
    return map;
  }, {}),
);

export const LAST_COLUMN_LETTER = COLUMN_LETTERS[COLUMN_COUNT - 1];

export const headerRow = () => RUNS_COLUMNS.map((column) => column.header);

/**
 * Visual sections of the Runs sheet, in column order. The sheet never inserts
 * blank spacer columns - grouping comes from header shading, column widths and
 * section-separator borders driven purely by these `startIndex`/`endIndex`
 * bounds (inclusive, 0-based).
 */
export const RUNS_SECTIONS = Object.freeze(
  [
    { key: "identification", label: "IDENTIFICATION", startKey: "runNumber" },
    { key: "result", label: "RESULT", startKey: "result" },
    { key: "overworld", label: "OVERWORLD", startKey: "seed" },
    { key: "nether", label: "NETHER", startKey: "netherSplitMs" },
    { key: "end", label: "END", startKey: "endSplitMs" },
    { key: "final", label: "FINAL", startKey: "finalTimeMs" },
    { key: "ranked", label: "RANKED", startKey: "eloBefore" },
    { key: "user", label: "USER", startKey: "notes" },
  ].map((section, index, all) => {
    const startIndex = COLUMN_INDEX[section.startKey];
    const endIndex =
      index + 1 < all.length ? COLUMN_INDEX[all[index + 1].startKey] - 1 : COLUMN_COUNT - 1;
    return { ...section, startIndex, endIndex };
  }),
);

/** Google Sheets serial day number for 1970-01-01T00:00:00Z. */
export const SHEETS_EPOCH_OFFSET_DAYS = 25569;
export const MS_PER_DAY = 86_400_000;

/** Renders the `Completion` formula for a 1-based sheet row. */
export const completionFormulaForRow = (row) =>
  COMPLETION_FORMULA_TEMPLATE(COLUMN_LETTERS[COLUMN_INDEX.completionType], row);

const isBlank = (value) => value === undefined || value === null || value === "";

export const msToDuration = (ms) =>
  typeof ms === "number" && Number.isFinite(ms) ? ms / MS_PER_DAY : "";

export const durationToMs = (value) => {
  // "N/A" (our display placeholder for a split the run never reached) is not a
  // number, so it deserialises back to `undefined` and the row round-trips
  // stably: absent -> "N/A" -> absent.
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  // Sheets day fractions only: a full day is 1.0, so anything larger is not a
  // duration cell (e.g. a row index pasted into the wrong column).
  if (value < 0 || value >= 2) return undefined;
  return Math.round(value * MS_PER_DAY);
};

export const msToSerialDate = (ms) =>
  typeof ms === "number" && Number.isFinite(ms) ? ms / MS_PER_DAY + SHEETS_EPOCH_OFFSET_DAYS : "";

export const serialDateToMs = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round((value - SHEETS_EPOCH_OFFSET_DAYS) * MS_PER_DAY);
};

/** Normalises a manual completion type read back out of the sheet. */
export const parseCompletionType = (value) => {
  if (isBlank(value)) return undefined;
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(numeric)) return undefined;
  return COMPLETION_TYPES.some((entry) => entry.value === numeric) ? numeric : undefined;
};

/**
 * Serialises one normalised record into a RAW value array for the Runs sheet.
 * The `Completion` column is intentionally left empty: it holds a generated
 * formula which is written in a separate USER_ENTERED request.
 */
export const serializeRecord = (record) =>
  RUNS_COLUMNS.map((column) => {
    if (column.type === "formula") return "";
    const value = record[column.key];
    switch (column.type) {
      case "int":
      case "manualInt":
      case "apiSeededInt":
        // An unknown Elo change is reported as 0 rather than left blank: a draw
        // genuinely moves no rating, and a visible 0 (tinted blue) is far easier
        // to read at a glance than an empty cell.
        if (column.key === "eloChange") {
          return typeof value === "number" && Number.isFinite(value) ? value : 0;
        }
        return typeof value === "number" && Number.isFinite(value) ? value : "";
      case "bool":
        // Always an explicit TRUE/FALSE. An empty cell reads as "no data" and
        // hides the meaning "this run did not count".
        return typeof value === "boolean" ? value : isBlank(value) ? false : Boolean(value);
      case "duration":
        // A split the run never reached is *not applicable*, which is a
        // different thing from "not measured yet". Real numbers are still
        // written as day fractions so Sheets can aggregate them.
        return typeof value === "number" && Number.isFinite(value) ? value / MS_PER_DAY : NOT_APPLICABLE;
      case "datetime":
        return msToSerialDate(value);
      case "manualCompletion": {
        const parsed = parseCompletionType(value);
        return parsed === undefined ? "" : parsed;
      }
      case "manualText":
        // A deathless run has no death messages to record.
        if (column.key === "deathMessages" && record.deaths === 0 && isBlank(value)) {
          return NOT_APPLICABLE;
        }
        return isBlank(value) ? "" : String(value);
      case "text":
      default:
        return isBlank(value) ? "" : String(value);
    }
  });

/**
 * Converts a RAW sheet row back into a partial record.
 * Missing cells are skipped rather than defaulted, so callers can tell the
 * difference between "user left this empty" and "value is zero".
 */
export const deserializeRow = (cells = []) => {
  const out = {};
  RUNS_COLUMNS.forEach((column, index) => {
    const value = cells[index] === undefined || cells[index] === null ? "" : cells[index];
    switch (column.type) {
      case "int":
      case "manualInt":
      case "apiSeededInt": {
        if (isBlank(value)) break;
        const numeric = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(numeric)) out[column.key] = numeric;
        break;
      }
      case "bool":
        out[column.key] = value === true || value === "TRUE" || value === "true";
        break;
      case "duration": {
        const ms = durationToMs(value);
        if (ms !== undefined) out[column.key] = ms;
        break;
      }
      case "datetime": {
        const ms = serialDateToMs(value);
        if (ms !== undefined) out[column.key] = ms;
        break;
      }
      case "manualCompletion": {
        const parsed = parseCompletionType(value);
        if (parsed !== undefined) out[column.key] = parsed;
        break;
      }
      case "manualText":
      case "text":
        out[column.key] = isBlank(value) ? "" : String(value);
        break;
      default:
        break;
    }
  });
  return out;
};

export { COMPLETION_TYPES, MANUAL_FIELDS };
