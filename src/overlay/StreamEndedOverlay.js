import React from "react";
import StreamSceneOverlay from "./StreamSceneOverlay";
import { resolveSceneConfig } from "./sceneConfig";

/**
 * End of stream scene - /overlay/ending (or ?scene=ending).
 * Pass ?next=<text> to show a next-stream card (e.g. ?next=Saturday%2020:00).
 * An optional ?countdown=<seconds> adds a countdown to the next stream.
 */
const StreamEndedOverlay = () => {
  const config = resolveSceneConfig("ending");

  return (
    <StreamSceneOverlay
      ariaLabel="Stream ended scene"
      title={config.title}
      headline="Stream Ended"
      subtitle="Thanks For Watching"
      countdownSeconds={config.countdownSeconds}
      countdownLabel="Next Stream In"
      countdownDoneLabel="Live Now"
      status="offline"
      statusLabel="OFFLINE"
      footer={config.username}
    >
      <div className="mcsr-scene__cards">
        {config.nextStream ? (
          <div className="mcsr-scene__card">
            <span className="mcsr-scene__card-label">Next Stream</span>
            <span className="mcsr-scene__card-value">{config.nextStream}</span>
          </div>
        ) : null}
      </div>
    </StreamSceneOverlay>
  );
};

export default StreamEndedOverlay;
