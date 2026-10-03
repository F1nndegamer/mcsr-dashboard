/**
 * Seed-related mappings.
 *
 * IMPORTANT: `seed.id` from the API is the MCSR *filtered seed id*
 * (e.g. "mtf37jg2v018mtm4"), NOT the numeric Minecraft seed. Neither
 * `/users/{id}/matches` nor `/matches/{id}` exposes the real seed number, so
 * the raw filtered id is kept as-is and the distinction stays explicit in the
 * normalised model (`seedId` vs `minecraftSeed`, the latter always null).
 */

export const BASTION_TYPE_LABELS = Object.freeze({
  TREASURE: "Treasure",
  HOUSING: "Housing",
  BRIDGE: "Bridge",
  STABLES: "Stables",
});

export const SEED_TYPE_LABELS = Object.freeze({
  SHIPWRECK: "Shipwreck",
  VILLAGE: "Village",
  DESERT_TEMPLE: "Desert Temple",
  RUINED_PORTAL: "Ruined Portal",
  WOODLAND_MANSION: "Woodland Mansion",
  JUNGLE_TEMPLE: "Jungle Temple",
  WITCH_HUT: "Witch Hut",
  IGLOO: "Igloo",
  OCEAN_MONUMENT: "Ocean Monument",
  PILLAGER_OUTPOST: "Pillager Outpost",
  BURIED_TREASURE: "Buried Treasure",
  MINESHAFT: "Mineshaft",
  AMETHYST_GEODE: "Amethyst Geode",
  NONE: "None",
});

/** SCREAMING_SNAKE_CASE (or anything else) -> readable Title Case. */
export const humaniseToken = (raw) =>
  String(raw)
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const lookUp = (map, raw, { warnings = [], label = "value" } = {}) => {
  if (raw === undefined || raw === null || raw === "") return "";
  const key = String(raw).trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  warnings.push(`Unmapped ${label} "${raw}" - showing a humanised fallback.`);
  return humaniseToken(raw);
};

/** Maps the API bastion type (seed.nether / match.bastionType) to display text. */
export const mapBastionType = (raw, options = {}) =>
  lookUp(BASTION_TYPE_LABELS, raw, { ...options, label: "bastion type" });

/** Maps the API overworld structure (seed.overworld / match.seedType). */
export const mapSeedType = (raw, options = {}) =>
  lookUp(SEED_TYPE_LABELS, raw, { ...options, label: "seed type" });

/**
 * Compact, accurate display of the raw End tower heights.
 * The API gives the heights of the four zero-relevant towers, e.g.
 * [79, 88, 91, 103] -> "79/88/91/103". The raw array is preserved on the
 * normalised model (`endTowerHeights`) so nothing is lost.
 */
export const formatEndTowers = (endTowers) => {
  if (!Array.isArray(endTowers) || endTowers.length === 0) return "";
  return endTowers
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .join("/");
};
