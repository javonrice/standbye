import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../theme";

/** Hero beat: a dark, full-frame "your plan changed" card. */
export function ChangedScene() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const drift = Math.sin(frame / 18) * 6;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.navy,
        alignItems: "center",
        justifyContent: "center",
        opacity: out,
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#FFFFFF",
          fontSize: 104,
          fontWeight: 800,
          letterSpacing: -2.4,
          lineHeight: 1.05,
          textAlign: "center",
          transform: `translateY(${interpolate(titleIn, [0, 1], [30, 0]) + drift}px)`,
          opacity: titleIn,
        }}
      >
        Your plan
        <br />
        changed
      </p>
    </AbsoluteFill>
  );
}
