import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../theme";

/** Closing card. Ends on the same light brand field the video opens on. */
export function Outro() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const inn = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const markIn = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0.35], {
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
          maxWidth: 900,
          textAlign: "center",
          color: theme.navy,
          fontSize: 76,
          fontWeight: 800,
          letterSpacing: -1.6,
          lineHeight: 1.15,
          opacity: inn,
          transform: `translateY(${interpolate(inn, [0, 1], [20, 0])}px)`,
        }}
      >
        Not just the flight.
        <br />
        The whole plan.
      </p>
      <Img
        src={staticFile("img/wordmark.png")}
        style={{ width: 460, marginTop: 80, opacity: markIn }}
      />
    </AbsoluteFill>
  );
}
