import React from "react";
import StreamSceneOverlay from "./StreamSceneOverlay";
import { resolveSceneConfig } from "./sceneConfig";

/**
 * "Be right back" scene - /overlay/brb (or ?scene=brb).
 * Countdown defaults to 3 minutes; override with ?countdown=<seconds>,
 * hide with ?countdown=0.
 */
const StreamBreakOverlay = () => {
  const config = resolveSceneConfig("brb");

  return (
    <StreamSceneOverlay
      ariaLabel="Be right back scene"
      title={config.title}
      headline="Be Right Back"
      subtitle="Stream Is On A Break"
      countdownSeconds={config.countdownSeconds}
      countdownLabel="Back In"
      countdownDoneLabel="Back Now"
      status="syncing"
      statusLabel="ON BREAK"
      footer={config.username}
    />
  );
};

export default StreamBreakOverlay;
