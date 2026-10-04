"use strict";

/**
 * Vercel serverless function: the stream overlay's run counter.
 *
 * GET /api/total-runs -> { totalRuns, goalRuns, spreadsheetId, source, updatedAt }
 *
 * Why this exists: the authoritative run count lives in the tracker spreadsheet
 * (the Dashboard's "Completed Runs / 1000" cell, a live COUNTIF over the Runs
 * sheet - see mcsr-1000-runs/src/sheets/dashboard.js). Reading it needs Google
 * credentials, which must never be shipped to the browser, so the overlay polls
 * this endpoint instead of the sheet itself.
 *
 * Credentials come from the environment only, using the same variable names the
 * tracker CLI already uses (see mcsr-1000-runs/.env.example):
 *   SPREADSHEET_ID
 *   GOOGLE_SERVICE_ACCOUNT_JSON   (inline JSON - the easiest fit for Vercel)
 *   or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 *
 * Optional:
 *   MCSR_DASHBOARD_SHEET  sheet title holding the counter (default "Dashboard")
 *   MCSR_DASHBOARD_RANGE  A1 range to scan        (default "Dashboard!A1:B24")
 *   MCSR_COUNTER_LABEL    label regex             (default /completed\s+runs/i)
 *   TOTAL_RUNS_CACHE_MS   success cache TTL       (default 60000)
 *
 * Dependency-free on purpose: this file is bundled by Vercel's Node runtime and
 * must not pull in the CRA toolchain or googleapis.
 */

const { createSign } = require("node:crypto");

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

const DEFAULT_LABEL = /completed\s+runs/i;
const DEFAULT_CACHE_MS = 60_000;
const TOKEN_SKEW_MS = 60_000;

// Warm-instance caches. Serverless functions are reused between invocations, so
// these keep us well inside the Google Sheets per-minute quota even though OBS
// polls every ~20s.
let cachedToken = null;
let cachedResult = null; // { payload, expiresAt }
let staleResult = null; // last known-good payload, served when Google is down

class ConfigError extends Error {}

const readConfig = () => {
  const spreadsheetId =
    process.env.SPREADSHEET_ID || process.env.MCSR_SPREADSHEET_ID || "";
  if (!spreadsheetId) {
    throw new ConfigError("SPREADSHEET_ID is not set.");
  }

  const sheet = process.env.MCSR_DASHBOARD_SHEET || "Dashboard";
  const range = process.env.MCSR_DASHBOARD_RANGE || `${sheet}!A1:B24`;

  let label = DEFAULT_LABEL;
  const rawLabel = process.env.MCSR_COUNTER_LABEL;
  if (rawLabel) {
    try {
      label = new RegExp(rawLabel, "i");
    } catch {
      throw new ConfigError(`MCSR_COUNTER_LABEL is not a valid regex: ${rawLabel}`);
    }
  }

  const cacheMs = Number.parseInt(process.env.TOTAL_RUNS_CACHE_MS, 10);

  return {
    spreadsheetId,
    range,
    label,
    cacheMs: Number.isFinite(cacheMs) && cacheMs >= 0 ? cacheMs : DEFAULT_CACHE_MS,
  };
};

/** Resolves the configured credential mode, mirroring the tracker CLI. */
const readGoogleAuth = () => {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return { mode: "service-account", json: process.env.GOOGLE_SERVICE_ACCOUNT_JSON };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";
  if (clientId && clientSecret && refreshToken) {
    return { mode: "refresh-token", clientId, clientSecret, refreshToken };
  }
  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return { mode: "access-token", accessToken: process.env.GOOGLE_ACCESS_TOKEN };
  }
  throw new ConfigError(
    "No Google credentials configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, or " +
      "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.",
  );
};

const parseServiceAccount = (value) => {
  const text = String(value).trim();
  if (!text.startsWith("{")) {
    throw new ConfigError(
      "GOOGLE_SERVICE_ACCOUNT_JSON must be the inline key JSON. Vercel has no " +
        "service-account key file, so paste the whole JSON into the env var.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ConfigError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new ConfigError(
      "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email / private_key.",
    );
  }
  return parsed;
};

const base64Url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Builds and signs the JWT assertion used by the service-account flow. */
const buildServiceAccountAssertion = (serviceAccount, now) => {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claims),
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer
    .sign(serviceAccount.private_key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${unsigned}.${signature}`;
};

const postForm = async (body) => {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google token request failed (${response.status}): ` +
        `${payload.error_description || payload.error || "unknown error"}`,
    );
  }
  return {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
};

/** Returns a valid access token, reusing the cached one until it nears expiry. */
const getAccessToken = async (google) => {
  if (google.mode === "access-token") return google.accessToken;
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > Date.now()) {
    return cachedToken.token;
  }

  let refreshed;
  if (google.mode === "service-account") {
    const assertion = buildServiceAccountAssertion(
      parseServiceAccount(google.json),
      Date.now(),
    );
    refreshed = await postForm({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    });
  } else {
    refreshed = await postForm({
      client_id: google.clientId,
      client_secret: google.clientSecret,
      refresh_token: google.refreshToken,
      grant_type: "refresh_token",
    });
  }

  cachedToken = refreshed;
  return cachedToken.token;
};

/** Accepts a number or a numeric string ("1,204") and returns an integer. */
const toCount = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
    return Math.floor(Number(cleaned));
  }
  return null;
};
/**
 * Finds the counter inside the scanned Dashboard range.
 *
 * The label lookup is the primary path, so a row inserted above the counter in
 * the Dashboard can never silently point us at the wrong cell. The
 * "X / 1000 Runs" text in the Progress row is only a fallback for a sheet
 * written before the labelled stat row existed.
 */
const extractCounter = (rows, label) => {
  for (const row of rows || []) {
    const rowLabel = String((row && row[0]) || "");
    if (!label.test(rowLabel)) continue;
    const value = toCount(row && row[1]);
    if (value !== null) {
      const goalMatch = rowLabel.replace(/,/g, "").match(/\/\s*(\d+)/);
      return { totalRuns: value, goalRuns: goalMatch ? Number(goalMatch[1]) : null };
    }
  }

  for (const row of rows || []) {
    const progressMatch = String((row && row[1]) || "").match(
      /(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*runs/i,
    );
    if (progressMatch) {
      return {
        totalRuns: toCount(progressMatch[1]),
        goalRuns: toCount(progressMatch[2]),
      };
    }
  }

  return null;
};

const readSheetValues = async (config, google) => {
  const token = await getAccessToken(google);
  const url =
    `${SHEETS_API}/${encodeURIComponent(config.spreadsheetId)}/values/` +
    `${encodeURIComponent(config.range)}` +
    "?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS";

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Google Sheets read failed (${response.status}): ${detail.slice(0, 200)}`,
    );
  }
  const payload = await response.json();
  return payload.values || [];
};

const loadCounter = async () => {
  const config = readConfig();
  const google = readGoogleAuth();

  if (cachedResult && cachedResult.expiresAt > Date.now()) {
    return cachedResult.payload;
  }

  try {
    const rows = await readSheetValues(config, google);
    const counter = extractCounter(rows, config.label);
    if (!counter) {
      throw new Error(
        `No "Completed Runs" row found in ${config.range}. Run \`npm run sync\` ` +
          "in mcsr-1000-runs so the Dashboard is written.",
      );
    }

    const payload = {
      totalRuns: counter.totalRuns,
      goalRuns: counter.goalRuns,
      spreadsheetId: config.spreadsheetId,
      source: "spreadsheet",
      updatedAt: new Date().toISOString(),
    };
    cachedResult = { payload, expiresAt: Date.now() + config.cacheMs };
    staleResult = payload;
    return payload;
  } catch (error) {
    // A transient Google blip must never blank the overlay, so fall back to the
    // last known-good read (Vercel's CDN caches it too).
    if (staleResult) return staleResult;
    throw error;
  }
};
module.exports = async function handler(req, res) {
  // The overlay is same-origin in OBS, but a Browser Source pointed at another
  // deployment should work too. This is a public, read-only counter.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    res.status(405).json({ error: "Method not allowed. Use GET." });
    return;
  }

  try {
    const payload = await loadCounter();
    // Let the CDN serve repeats without waking the function at all.
    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
    );
    res.status(200).json(payload);
  } catch (error) {
    const status = error instanceof ConfigError ? 500 : 502;
    console.error(
      `[total-runs] ${status === 500 ? "configuration" : "upstream"} error:`,
      error.message,
    );
    res.status(status).json({ error: error.message });
  }
};

// Exported for unit tests only - Vercel only ever calls the handler above.
module.exports._private = {
  buildServiceAccountAssertion,
  extractCounter,
  parseServiceAccount,
  readConfig,
  readGoogleAuth,
  toCount,
};