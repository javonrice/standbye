import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { Screenshot } from "../components/Screenshot";
import { ANCHOR, theme } from "../theme";

/** Hero beat: the plan changed, shown on the real reranked screen. */
export function ChangedScene() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleIn = spring({ frame, fps, config: { damping: 200 } });
  const titleOut = interpolate(frame, [44, 58], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reveal = interpolate(frame, [44, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [44, durationInFrames], [ANCHOR.after.notice - 60, ANCHOR.after.primary], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ opacity: reveal }}>
        <Screenshot src="detail-after" y={y} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: titleIn * titleOut,
          backgroundColor: theme.navy,
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#FFFFFF",
            fontSize: 96,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.05,
            textAlign: "center",
            transform: `translateY(${interpolate(titleIn, [0, 1], [26, 0])}px)`,
          }}
        >
          Your plan
          <br />
          changed
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
