import { RESULT } from "../models/constants.js";

/**
 * Sequential Match # and Run # assignment.
 *
 * - Match # is a 1-based index over every imported match in chronological order
 *   (independent of Run #).
 * - Run # only increments for genuine qualifying wins; it is left undefined for
 *   losses / draws / forfeits.
 *
 * Both are derived, never typed by the user, and re-derived on every sync so
 * inserting an older match can never corrupt the numbering.
 *
 * @param {Array<Object>} records normalised records (any order)
 * @returns {Array<Object>} new array, chronologically ordered, with numbering
 */
export const assignNumbers = (records) => {
  const ordered = [...records].sort((a, b) => {
    const dateA = typeof a.dateMs === "number" ? a.dateMs : 0;
    const dateB = typeof b.dateMs === "number" ? b.dateMs : 0;
    if (dateA !== dateB) return dateA - dateB;
    return (a.matchId ?? 0) - (b.matchId ?? 0);
  });

  let runCounter = 0;

  return ordered.map((record, index) => {
    const counts = record.result === RESULT.WIN;
    if (counts) runCounter += 1;
    const next = { ...record, matchNumber: index + 1 };
    if (counts) {
      next.runNumber = runCounter;
    } else {
      delete next.runNumber;
    }
    return next;
  });
};

/** Highest Run # currently assigned in a record set (0 when none). */
export const highestRunNumber = (records) =>
  records.reduce(
    (max, record) => (typeof record.runNumber === "number" && record.runNumber > max ? record.runNumber : max),
    0,
  );
