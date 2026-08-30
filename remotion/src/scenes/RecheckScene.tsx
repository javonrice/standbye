import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Screenshot } from "../components/Screenshot";
import { ANCHOR, theme } from "../theme";

/** The moment conditions move and Standbye rechecks the plan. */
export function RecheckScene() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const focus = interpolate(frame, [0, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const dots = Math.floor((frame / 9) % 4);
  const pulse = 1 + Math.sin(frame / 7) * 0.012;

  return (
    <AbsoluteFill>
      <Screenshot
        src="detail-before"
        y={ANCHOR.before.backups}
        blur={focus * 10}
        dim={focus * 0.42}
      />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: focus * out }}>
        <div
          style={{
            transform: `scale(${pulse})`,
            backgroundColor: theme.card,
            borderRadius: 48,
            padding: "44px 56px",
            textAlign: "center",
            boxShadow: "0 30px 80px rgba(19,30,54,0.28)",
            maxWidth: 860,
          }}
        >
          <p style={{ margin: 0, fontSize: 54, fontWeight: 700, color: theme.navy, letterSpacing: -1 }}>
            Rechecking your plan{".".repeat(dots)}
          </p>
          <p style={{ margin: "18px 0 0", fontSize: 36, color: theme.muted, lineHeight: 1.35 }}>
            A fresh reported load came in on UA2110.
          </p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
