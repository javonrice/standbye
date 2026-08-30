import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Caption } from "../components/Caption";
import { Screenshot } from "../components/Screenshot";
import { ANCHOR } from "../theme";

/** The real plan screen: origin, date, and the traveler's chosen primary option. */
export function PrimaryScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const y = interpolate(frame, [0, durationInFrames], [ANCHOR.before.header - 40, ANCHOR.before.primary], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoom = interpolate(frame, [0, durationInFrames], [1.18, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <Screenshot src="detail-before" y={y} zoom={zoom} />
      <Caption delay={46}>Your primary option</Caption>
    </AbsoluteFill>
  );
}
