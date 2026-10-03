/**
 * Split derivation from the semantic timeline events.
 *
 * Definitions (match start is t=0, all values in milliseconds):
 *   OW Split     : match start      -> NETHER_ENTER
 *   Nether Split : NETHER_ENTER     -> STRONGHOLD_ENTER
 *   Bastion Time : BASTION_ENTER    -> FORTRESS_ENTER
 *   End Split    : END_ENTER        -> COMPLETE
 *
 * A split is left blank (never guessed) when either endpoint is missing, and
 * the reason is recorded so the sync engine can log it.
 */

const difference = (from, to, label, notes) => {
  if (typeof from !== "number" || typeof to !== "number") {
    const missing = [];
    if (typeof from !== "number") missing.push(label.from);
    if (typeof to !== "number") missing.push(label.to);
    notes.push(`${label.name} unavailable: missing ${missing.join(" + ")}.`);
    return undefined;
  }
  const delta = to - from;
  if (delta < 0) {
    notes.push(`${label.name} unavailable: ${label.to} earlier than ${label.from}.`);
    return undefined;
  }
  return delta;
};

/**
 * @param {Object} args
 * @param {Record<string, number>} args.events semantic events -> ms
 * @param {number} [args.finalTimeMs] authoritative completion time, if known
 * @returns {{owSplitMs?: number, netherSplitMs?: number, bastionTimeMs?: number,
 *            endSplitMs?: number, finalTimeMs?: number, notes: string[]}}
 */
export const deriveSplits = ({ events = {}, finalTimeMs } = {}) => {
  const notes = [];
  const complete = typeof events.COMPLETE === "number" ? events.COMPLETE : finalTimeMs;

  const owSplitMs = difference(0, events.NETHER_ENTER, {
    name: "OW Split",
    from: "match start",
    to: "Nether Enter",
  }, notes);

  const netherSplitMs = difference(events.NETHER_ENTER, events.STRONGHOLD_ENTER, {
    name: "Nether Split",
    from: "Nether Enter",
    to: "Stronghold Enter",
  }, notes);

  const bastionTimeMs = difference(events.BASTION_ENTER, events.FORTRESS_ENTER, {
    name: "Bastion Time",
    from: "Bastion Enter",
    to: "Fortress Enter",
  }, notes);

  const endSplitMs = difference(events.END_ENTER, complete, {
    name: "End Split",
    from: "End Enter",
    to: "Complete",
  }, notes);

  const resolvedFinal = typeof complete === "number" ? complete : undefined;
  if (resolvedFinal === undefined) {
    notes.push("Final Time unavailable: no completion record and no Complete event.");
  }

  return {
    owSplitMs,
    netherSplitMs,
    bastionTimeMs,
    endSplitMs,
    finalTimeMs: resolvedFinal,
    notes,
  };
};
