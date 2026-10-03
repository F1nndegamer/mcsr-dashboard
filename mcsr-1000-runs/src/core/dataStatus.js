import { DATA_STATUS, RESULT } from "../models/constants.js";

/**
 * `Data Status` is generated, never typed.
 *
 * Only qualifying completed runs (WIN) can be NEEDS INPUT, because only they
 * need the manual completion data. Losses / draws / forfeits are marked
 * COMPLETE so they never look like they are missing information.
 *
 * Required manual fields for a WIN:
 *   Bastion Variant, Completion Type, Deaths
 *   Death Messages - only required when Deaths > 0 (a deathless run has none)
 *
 * Blaze Rods is explicitly optional and never affects the status.
 */

const isMissingText = (value) =>
  value === undefined || value === null || String(value).trim() === "";

/**
 * @param {Object} record normalised record
 * @returns {{status: "COMPLETE"|"NEEDS INPUT", missing: string[]}}
 */
export const evaluateDataStatus = (record = {}) => {
  if (record.result !== RESULT.WIN) {
    return { status: DATA_STATUS.COMPLETE, missing: [] };
  }

  const missing = [];
  if (isMissingText(record.bastionVariant)) missing.push("Bastion Variant");
  if (record.completionType === undefined || record.completionType === null) {
    missing.push("Completion Type");
  }
  if (typeof record.deaths !== "number" || !Number.isFinite(record.deaths)) {
    missing.push("Deaths");
  } else if (record.deaths > 0 && isMissingText(record.deathMessages)) {
    missing.push("Death Messages");
  }

  return {
    status: missing.length > 0 ? DATA_STATUS.NEEDS_INPUT : DATA_STATUS.COMPLETE,
    missing,
  };
};

export const computeDataStatus = (record) => evaluateDataStatus(record).status;
