import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Dependency-free Google OAuth support (no `googleapis` package needed).
 *
 * Three modes, chosen from the environment:
 *   refresh-token   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN
 *                   (recommended - matches typical personal-project OAuth setup)
 *   service-account GOOGLE_SERVICE_ACCOUNT_JSON (path or inline JSON)
 *   access-token    GOOGLE_ACCESS_TOKEN (1 hour lifetime, handy for CI/tests)
 *
 * Credentials are only ever read from the environment / local files. Nothing is
 * written into source code and the raw API cache never contains them.
 */

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class GoogleAuthError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "GoogleAuthError";
    this.detail = detail;
  }
}

const base64Url = (input) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const loadServiceAccount = (value) => {
  if (!value) throw new GoogleAuthError("GOOGLE_SERVICE_ACCOUNT_JSON is empty.");
  const text = value.trim().startsWith("{") ? value : readFileSync(value, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new GoogleAuthError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.", error.message);
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new GoogleAuthError("Service account JSON is missing client_email / private_key.");
  }
  return parsed;
};

/** Builds and signs the JWT assertion used by the service-account flow. */
export const buildServiceAccountAssertion = (serviceAccount, { now = Date.now() } = {}) => {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
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

const postForm = async (fetchImpl, body) => {
  let response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    throw new GoogleAuthError("Could not reach the Google token endpoint.", error.message);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new GoogleAuthError(
      `Google token request failed (${response.status}): ${payload.error_description || payload.error || "unknown error"}`,
      payload,
    );
  }
  return {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
};

/**
 * Returns a valid access token for the configured mode.
 * Refreshes automatically when the cached token is close to expiry.
 */
export const getAccessToken = async ({ google, fetchImpl = globalThis.fetch, now = () => Date.now() }) => {
  switch (google?.mode) {
    case "access-token":
      return { token: google.accessToken, source: "GOOGLE_ACCESS_TOKEN" };

    case "refresh-token":
      return {
        ...(await postForm(fetchImpl, {
          client_id: google.clientId,
          client_secret: google.clientSecret,
          refresh_token: google.refreshToken,
          grant_type: "refresh_token",
        })),
        source: "GOOGLE_REFRESH_TOKEN",
      };

    case "service-account": {
      const serviceAccount = loadServiceAccount(google.serviceAccountJson);
      const assertion = buildServiceAccountAssertion(serviceAccount, { now: now() });
      return {
        ...(await postForm(fetchImpl, {
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion,
        })),
        source: "GOOGLE_SERVICE_ACCOUNT_JSON",
      };
    }

    default:
      throw new GoogleAuthError(
        [
          "No Google credentials configured.",
          "Set one of:",
          "  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN",
          "  GOOGLE_SERVICE_ACCOUNT_JSON",
          "  GOOGLE_ACCESS_TOKEN",
          "See mcsr-1000-runs/README.md -> 'Google authentication'.",
        ].join("\n"),
      );
  }
};

/** Caches a token until shortly before it expires. */
export const createTokenProvider = ({ google, fetchImpl, now = () => Date.now(), skewMs = 60_000 }) => {
  let cached = null;
  return async () => {
    // A static token never expires from our point of view: the user set it.
    if (google?.mode === "access-token") return google.accessToken;
    if (cached && cached.expiresAt - skewMs > now()) return cached.token;
    cached = await getAccessToken({ google, fetchImpl, now });
    return cached.token;
  };
};
