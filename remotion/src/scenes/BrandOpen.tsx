import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../theme";

/** Fast 1.5s cold open: the premise, with the wordmark kept small. */
export function BrandOpen() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const lineIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markIn = interpolate(frame, [6, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: out,
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: 880,
          textAlign: "center",
          color: theme.navy,
          fontSize: 78,
          fontWeight: 800,
          letterSpacing: -1.8,
          lineHeight: 1.12,
          opacity: lineIn,
          transform: `translateY(${interpolate(lineIn, [0, 1], [22, 0])}px)`,
        }}
      >
        One flight is never the whole standby plan.
      </p>
      <Img
        src={staticFile("img/wordmark.png")}
        style={{ width: 300, marginTop: 64, opacity: markIn }}
      />
    </AbsoluteFill>
  );
}
