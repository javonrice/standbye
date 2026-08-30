import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Caption } from "../components/Caption";
import { Screenshot } from "../components/Screenshot";
import { ANCHOR } from "../theme";

/** Standbye prefers another option; the traveler's primary is untouched. */
export function ChoiceScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const y = interpolate(frame, [0, durationInFrames], [ANCHOR.after.primary, ANCHOR.after.prefers], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Screenshot src="detail-after" y={y} />
      <Caption delay={30}>You decide whether to switch</Caption>
    </AbsoluteFill>
  );
}
