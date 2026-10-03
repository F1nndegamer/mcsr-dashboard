import { RESULT } from "../models/constants.js";

/**
 * Result classification.
 *
 * Priority is deliberately forfeit-first: an opponent can forfeit, in which
 * case the API still reports the tracked player as `result.uuid`. That must be
 * FORFEIT (it is not a completed run), so we must NOT simply compare
 * `winner === player`.
 *
 *   if forfeited      -> FORFEIT
 *   else if no winner -> DRAW
 *   else if player    -> WIN
 *   else if opponent  -> LOSS
 *   else              -> DRAW (+ warning: unknown winner)
 */

const isForfeitFlag = (forfeited) =>
  forfeited === true || forfeited === 1 || forfeited === "true";

/**
 * @param {Object} args
 * @param {*} args.forfeited      raw `forfeited` flag from the API
 * @param {string|null} args.winnerUuid   `result.uuid`
 * @param {string} args.playerUuid
 * @param {string|null} [args.opponentUuid]
 * @returns {{result: string, countsToward1000: boolean, warnings: string[]}}
 */
export const classifyMatch = ({ forfeited, winnerUuid, playerUuid, opponentUuid } = {}) => {
  const warnings = [];

  if (forfeited === undefined || forfeited === null) {
    warnings.push("`forfeited` missing from match payload; assuming not forfeited.");
  }
  if (!playerUuid) {
    warnings.push("Tracked player uuid missing; cannot classify confidently.");
  }

  if (isForfeitFlag(forfeited)) {
    return { result: RESULT.FORFEIT, countsToward1000: false, warnings };
  }

  if (winnerUuid === undefined || winnerUuid === null || winnerUuid === "") {
    return { result: RESULT.DRAW, countsToward1000: false, warnings };
  }

  if (playerUuid && winnerUuid === playerUuid) {
    return { result: RESULT.WIN, countsToward1000: true, warnings };
  }

  if (opponentUuid && winnerUuid === opponentUuid) {
    return { result: RESULT.LOSS, countsToward1000: false, warnings };
  }

  warnings.push(
    `Winner uuid "${winnerUuid}" matches neither tracked player nor opponent; classified as DRAW (does not count).`,
  );
  return { result: RESULT.DRAW, countsToward1000: false, warnings };
};

/** Convenience wrapper returning just the result string. */
export const classifyResult = (input) => classifyMatch(input).result;
