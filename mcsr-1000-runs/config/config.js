import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MODULE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const stripQuotes = (value) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

/**
 * Minimal dependency-free .env parser.
 * Existing process.env values always win, so real environment variables
 * (CI, shell exports) override the files.
 */
export const loadEnvFiles = (files, { env = process.env } = {}) => {
  const loaded = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key || key in env) continue;
      env[key] = stripQuotes(trimmed.slice(eq + 1));
    }
    loaded.push(file);
  }
  return loaded;
};

export const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalised = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalised)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalised)) return false;
  return fallback;
};

const parseIntOr = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses START_DATE (YYYY-MM-DD) into an epoch in milliseconds, interpreted
 * inside the configured UTC offset. Returns null when unset.
 */
export const parseStartDate = (value, utcOffsetMinutes = 0) => {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  if (!ISO_DATE.test(text)) {
    throw new Error(
      `START_DATE must be an ISO date (YYYY-MM-DD), received "${value}".`,
    );
  }
  const [y, m, d] = text.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return utcMidnight - utcOffsetMinutes * 60_000;
};

export const formatStartDate = (epochMs, utcOffsetMinutes = 0) =>
  new Date(epochMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);

const detectGoogleAuthMode = (env) => {
  if (env.GOOGLE_ACCESS_TOKEN) return "access-token";
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) return "service-account";
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN) {
    return "refresh-token";
  }
  return "none";
};

/**
 * Builds the fully resolved runtime configuration.
 * Never throws for missing Google credentials - only Google-backed commands
 * need them, and they fail with an actionable message at use time.
 */
export const loadConfig = ({ env = process.env, rootDir = MODULE_ROOT } = {}) => {
  const utcOffsetMinutes = parseIntOr(env.UTC_OFFSET_MINUTES, 0);
  const startDateMs = parseStartDate(env.START_DATE, utcOffsetMinutes);
  const dataDir = path.resolve(rootDir, env.DATA_DIR || "data");

  return {
    rootDir,
    player: env.MCSR_PLAYER || "AwenRuns",
    startDate: env.START_DATE || "",
    startDateMs,
    startDateIso: startDateMs === null ? null : formatStartDate(startDateMs, utcOffsetMinutes),
    utcOffsetMinutes,
    spreadsheetId: env.SPREADSHEET_ID || "",
    spreadsheetTitle: env.SPREADSHEET_TITLE || `MCSR 1000 Runs - ${env.MCSR_PLAYER || "AwenRuns"}`,
    backend: (env.MCSR_BACKEND || "google").toLowerCase(),
    fileBackendDir: path.resolve(rootDir, env.FILE_BACKEND_DIR || "out/sheet"),
    excludeDecayed: parseBoolean(env.EXCLUDE_DECAYED, true),
    reconcileDays: parseIntOr(env.RECONCILE_DAYS, 3),
    incrementalSeasonLookback: parseIntOr(env.INCREMENTAL_SEASON_LOOKBACK, 1),
    sheetRowCapacity: Math.max(200, parseIntOr(env.SHEET_ROW_CAPACITY, 2500)),
    dataDir,
    mcsrPrivateKey: env.MCSR_PRIVATE_KEY || "",
    google: {
      mode: detectGoogleAuthMode(env),
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
      refreshToken: env.GOOGLE_REFRESH_TOKEN || "",
      serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
      accessToken: env.GOOGLE_ACCESS_TOKEN || "",
    },
  };
};

/** Loads .env.local then .env (existing env wins) and returns the config. */
export const loadConfigFromDisk = ({ env = process.env, rootDir = MODULE_ROOT } = {}) => {
  loadEnvFiles([path.join(rootDir, ".env.local"), path.join(rootDir, ".env")], { env });
  return loadConfig({ env, rootDir });
};
