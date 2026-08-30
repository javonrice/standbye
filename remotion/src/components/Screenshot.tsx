import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";

import { theme } from "../theme";

/** Native width of the captured mobile screens. */
const SOURCE_WIDTH = 1080;

/**
 * Full-bleed real app capture with a virtual camera. `y` is the source pixel
 * that sits at the top of the frame; `zoom` enlarges the capture around the
 * horizontal centre so small type stays readable at hero size.
 */
export function Screenshot({
  src,
  y,
  zoom = 1.12,
  blur = 0,
  dim = 0,
}: {
  src: "detail-before" | "detail-after";
  y: number;
  zoom?: number;
  blur?: number;
  dim?: number;
}) {
  const width = SOURCE_WIDTH * zoom;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      <AbsoluteFill style={{ filter: blur > 0 ? `blur(${blur}px)` : undefined }}>
        <Img
          src={staticFile(`img/${src}.png`)}
          style={{
            position: "absolute",
            top: -y * zoom,
            left: -(width - SOURCE_WIDTH) / 2,
            width,
          }}
        />
      </AbsoluteFill>
      {dim > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(19,30,54,${dim})` }} />}
    </AbsoluteFill>
  );
}
