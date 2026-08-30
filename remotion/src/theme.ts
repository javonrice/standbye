/** Standbye brand tokens mirrored from the app design system (display only). */
export const theme = {
  bg: "#F3F5FA",
  navy: "#131E36",
  primary: "#2A5CE0",
  sky: "#5AA6F5",
  muted: "#6B7488",
  rough: "#D4523A",
  fine: "#2E9E76",
  card: "#FFFFFF",
} as const;

/** 30fps timeline. Total 750 frames = 25.0s. */
export const TIMELINE = {
  fps: 30,
  total: 750,
  brand: { from: 0, duration: 95 },
  primary: { from: 95, duration: 145 },
  backups: { from: 240, duration: 125 },
  recheck: { from: 365, duration: 95 },
  changed: { from: 460, duration: 130 },
  choice: { from: 590, duration: 90 },
  outro: { from: 680, duration: 70 },
} as const;

/** Vertical anchors (in source-image pixels) of real UI blocks. */
export const ANCHOR = {
  before: { header: 120, primary: 560, backups: 1210, watch: 1720 },
  after: { notice: 430, primary: 1180, prefers: 1860, backups: 2280 },
} as const;
