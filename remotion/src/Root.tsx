import React from "react";
import { Composition } from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";

import { MainVideo } from "./MainVideo";
import { TIMELINE } from "./theme";

loadFont("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });

export function RemotionRoot() {
  return (
    <Composition
      id="main"
      component={MainVideo}
      durationInFrames={TIMELINE.total}
      fps={TIMELINE.fps}
      width={1080}
      height={1920}
    />
  );
}
