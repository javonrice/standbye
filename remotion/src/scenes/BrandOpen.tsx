import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../theme";

/** Opening title card: mark, wordmark, and the premise of the story. */
export function BrandOpen() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const rise = spring({ frame, fps, config: { damping: 200 } });
  const markScale = interpolate(rise, [0, 1], [0.86, 1]);
  const lineIn = interpolate(frame, [18, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(frame, [durationInFrames - 14, durationInFrames], [1, 0], {
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
      <Img
        src={staticFile("img/mark.png")}
        style={{ width: 260, transform: `scale(${markScale})`, opacity: rise }}
      />
      <Img
        src={staticFile("img/wordmark.png")}
        style={{ width: 520, marginTop: 44, opacity: rise }}
      />
      <p
        style={{
          marginTop: 70,
          maxWidth: 840,
          textAlign: "center",
          color: theme.muted,
          fontSize: 46,
          lineHeight: 1.35,
          fontWeight: 500,
          opacity: lineIn,
          transform: `translateY(${interpolate(lineIn, [0, 1], [16, 0])}px)`,
        }}
      >
        One flight is never the whole standby plan.
      </p>
    </AbsoluteFill>
  );
}
