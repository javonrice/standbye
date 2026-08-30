import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Caption } from "../components/Caption";
import { Screenshot } from "../components/Screenshot";
import { ANCHOR } from "../theme";

/** Pans from the primary card down to the real backup runway block. */
export function BackupsScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const y = interpolate(frame, [0, durationInFrames], [ANCHOR.before.primary, ANCHOR.before.backups], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Screenshot src="detail-before" y={y} />
      <Caption delay={54}>The realistic ways there</Caption>
    </AbsoluteFill>
  );
}
