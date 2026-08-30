import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Caption } from "../components/Caption";
import { Screenshot } from "../components/Screenshot";
import { ANCHOR } from "../theme";

/** The payoff: a stronger option is named, and the traveler still decides. */
export function ChoiceScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const reveal = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, durationInFrames], [ANCHOR.after.notice - 40, ANCHOR.after.prefers], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: reveal }}>
      <Screenshot src="detail-after" y={y} />
      <Caption delay={6} out={[86, 100]}>
        UA1522 now looks stronger than your primary
      </Caption>
    </AbsoluteFill>
  );
}
