import React from "react";
import { AbsoluteFill, Sequence } from "remotion";

import { BackupsScene } from "./scenes/BackupsScene";
import { BrandOpen } from "./scenes/BrandOpen";
import { ChangedScene } from "./scenes/ChangedScene";
import { ChoiceScene } from "./scenes/ChoiceScene";
import { Outro } from "./scenes/Outro";
import { PrimaryScene } from "./scenes/PrimaryScene";
import { RecheckScene } from "./scenes/RecheckScene";
import { theme, TIMELINE } from "./theme";

/** 1080x1920 mobile product story built from real Standbye captures. */
export function MainVideo() {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: "Outfit, sans-serif" }}>
      <Sequence from={TIMELINE.brand.from} durationInFrames={TIMELINE.brand.duration}>
        <BrandOpen />
      </Sequence>
      <Sequence from={TIMELINE.primary.from} durationInFrames={TIMELINE.primary.duration}>
        <PrimaryScene />
      </Sequence>
      <Sequence from={TIMELINE.backups.from} durationInFrames={TIMELINE.backups.duration}>
        <BackupsScene />
      </Sequence>
      <Sequence from={TIMELINE.recheck.from} durationInFrames={TIMELINE.recheck.duration}>
        <RecheckScene />
      </Sequence>
      <Sequence from={TIMELINE.changed.from} durationInFrames={TIMELINE.changed.duration}>
        <ChangedScene />
      </Sequence>
      <Sequence from={TIMELINE.choice.from} durationInFrames={TIMELINE.choice.duration}>
        <ChoiceScene />
      </Sequence>
      <Sequence from={TIMELINE.outro.from} durationInFrames={TIMELINE.outro.duration}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}
