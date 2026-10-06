import { resolveOverlayConfig } from "./overlayConfig";

/**
 * Routing and configuration for the full-screen OBS scenes (starting soon /
 * be right back / end of stream). Follows the same conventions as
 * overlayConfig.js: everything is overridable through the URL, so each scene
 * can be used as an independent OBS Browser Source.
 *
 * A scene is selected with any of:
 *   /overlay/starting    #/overlay/starting    ?scene=starting
 *   /overlay/brb         #/overlay/brb         ?scene=brb
 *   /overlay/ending      #/overlay/ending      ?scene=ending
 * (?overlay=<scene> also works; ?overlay=1 keeps meaning "stats overlay".)
 *
 * Scene-only query params:
 *   ?countdown=300   countdown length in seconds (0 hides the countdown)
 *   ?next=Saturday   text for the "next stream" card (ending scene)
 *   ?title=...       inherited from resolveOverlayConfig(), along with ?user=
 */
export const OVERLAY_SCENES = ["starting", "brb", "ending"];

const SCENE_ALIASES = {
  starting: "starting",
  start: "starting",
  brb: "brb",
  break: "brb",
  ending: "ending",
  end: "ending",
};

/** Per-scene countdown default (seconds); null = no countdown unless asked. */
const DEFAULT_COUNTDOWN_SECONDS = {
  starting: 5 * 60,
  brb: 3 * 60,
  ending: null,
};

const normalizeSceneKey = (value) => {
  if (value == null || value === "") return null;
  const key = String(value)
    .toLowerCase()
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return SCENE_ALIASES[key] ?? null;
};

/** Extracts a scene key from a "/overlay[/scene]" path (or "#/overlay/..."). */
const sceneFromRoute = (route) => {
  const withoutHash = String(route ?? "").replace(/^#/, "");
  if (!withoutHash.startsWith("/overlay")) return null;
  return normalizeSceneKey(withoutHash.replace(/^\/overlay/, ""));
};

const parseSeconds = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Resolves which overlay the current URL asks for: a full-screen scene key
 * ("starting" | "brb" | "ending") or null for the stats overlay.
 */
export const resolveOverlayScene = ({
  pathname = window.location.pathname,
  hash = window.location.hash,
  search = window.location.search,
} = {}) => {
  const params = new URLSearchParams(search);

  const fromQuery = normalizeSceneKey(params.get("scene"));
  if (fromQuery) return fromQuery;

  const overlayParam = params.get("overlay");
  if (overlayParam && overlayParam !== "1") {
    const fromOverlay = normalizeSceneKey(overlayParam);
    if (fromOverlay) return fromOverlay;
  }

  return sceneFromRoute(pathname) ?? sceneFromRoute(hash);
};

/**
 * Scene configuration: inherits title/username from the stats overlay config
 * and resolves the scene's countdown. `?countdown=0` hides the countdown; an
 * invalid/missing value falls back to the scene default.
 */
export const resolveSceneConfig = (
  scene,
  search = window.location.search,
) => {
  const params = new URLSearchParams(search);
  const base = resolveOverlayConfig(search);
  const defaultCountdown = DEFAULT_COUNTDOWN_SECONDS[scene] ?? null;
  const requestedCountdown = parseSeconds(params.get("countdown"));

  const countdownSeconds =
    requestedCountdown !== null
      ? requestedCountdown > 0
        ? requestedCountdown
        : null
      : defaultCountdown;

  return {
    scene,
    title: base.title,
    username: base.username,
    countdownSeconds,
    nextStream: params.get("next"),
  };
};
