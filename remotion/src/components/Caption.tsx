import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { theme } from "../theme";

/** Quiet lower caption used to name what the real screen is showing. */
export function Caption({
  children,
  delay = 0,
  bottom = 96,
  out,
}: {
  children: React.ReactNode;
  delay?: number;
  bottom?: number;
  /** Optional [startFade, endFade] frames, relative to the scene. */
  out?: [number, number];
}) {
  const raw = useCurrentFrame();
  const frame = raw - delay;
  const fadeOut = out
    ? interpolate(raw, out, [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  const opacity =
    fadeOut *
    interpolate(frame, [0, 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  const lift = interpolate(frame, [0, 16], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 420,
          opacity,
          background: "linear-gradient(to bottom, rgba(243,245,250,0) 0%, rgba(243,245,250,0.92) 55%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          bottom,
          opacity,
          transform: `translateY(${lift}px)`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(19,30,54,0.94)",
            color: "#FFFFFF",
            padding: "24px 38px",
            borderRadius: 999,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -0.4,
            textAlign: "center",
            boxShadow: "0 24px 60px rgba(19,30,54,0.22)",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}

/** Soft focus ring drawn over a real UI block, never over fake UI. */
export function Highlight({
  top,
  height,
  delay = 0,
  color = theme.primary,
}: {
  top: number;
  height: number;
  delay?: number;
  color?: string;
}) {
  const frame = useCurrentFrame() - delay;
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const grow = interpolate(frame, [0, 18], [0.98, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 24,
        right: 24,
        top,
        height,
        borderRadius: 44,
        border: `4px solid ${color}`,
        boxShadow: `0 0 0 9999px rgba(19,30,54,0.34)`,
        opacity,
        transform: `scale(${grow})`,
      }}
    />
  );
}
