import {
  COMPLETION_TYPES,
  INVALID_COMPLETION_LABEL,
} from "../models/constants.js";
import { parseCompletionType } from "../models/runRecord.js";

/**
 * Mirrors the generated Google Sheets formula exactly:
 *   -1 -> One-shot, 0 -> Zero-cycle, 1 -> One-cycle, blank -> blank,
 *   anything else -> "Invalid".
 *
 * Keeping this in JS lets the sync engine and the tests cover the same mapping
 * that the spreadsheet formula implements, without needing a live sheet.
 */
export const completionLabel = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const parsed = parseCompletionType(value);
  if (parsed === undefined) return INVALID_COMPLETION_LABEL;
  const match = COMPLETION_TYPES.find((entry) => entry.value === parsed);
  return match ? match.label : INVALID_COMPLETION_LABEL;
};

export const completionTypeOptions = () => COMPLETION_TYPES.map((entry) => entry.value);
