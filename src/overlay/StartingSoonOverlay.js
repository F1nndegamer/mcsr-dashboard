import React from "react";
import StreamSceneOverlay from "./StreamSceneOverlay";
import { resolveSceneConfig } from "./sceneConfig";

/**
 * "Stream starting soon" scene - /overlay/starting (or ?scene=starting).
 * Countdown defaults to 5 minutes; override with ?countdown=<seconds>,
 * hide with ?countdown=0.
 */
const StartingSoonOverlay = () => {
  const config = resolveSceneConfig("starting");

  return (
    <StreamSceneOverlay
      ariaLabel="Stream starting soon scene"
      title={config.title}
      headline="Stream Starting Soon"
      subtitle="Get Ready"
      countdownSeconds={config.countdownSeconds}
      countdownLabel="Starts In"
      countdownDoneLabel="Starting Now"
      status="syncing"
      statusLabel="STANDBY"
      footer={config.username}
    />
  );
};

export default StartingSoonOverlay;
