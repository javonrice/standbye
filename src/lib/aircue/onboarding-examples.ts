/** Static teaching examples used during onboarding. No live data is fetched. */

import type { Judgment, PillarState } from "@/lib/aircue/standby";

export interface ExampleRow {
  label: string;
  value: string;
  state: PillarState;
}

export interface ExampleFlight {
  flightLabel: string;
  depLocal: string;
  judgment: Judgment;
  rows: ExampleRow[];
  footnote: string;
}

/** The origin the examples use — the traveller's own airport when we know it. */
export function exampleOrigin(homeAirport: string | null | undefined): string {
  const code = (homeAirport ?? "").trim().toUpperCase();
  return code.length === 3 && code !== "LAX" ? code : "ORD";
}

/**
 * Screen 08 — the widest public booking check is not automatically the
 * smartest first attempt.
 */
export function bookingCheckExample(origin: string): ExampleFlight[] {
  return [
    {
      flightLabel: `UA222 · ${origin} → LAX`,
      depLocal: "7:10 AM",
      judgment: "favorable",
      rows: [
        { label: "Booking check", value: "3 travelers", state: "unknown" },
        { label: "Operations", value: "Normal", state: "good" },
        { label: "Recovery", value: "Excellent", state: "good" },
      ],
      footnote: "6 later shots remain",
    },
    {
      flightLabel: `UA455 · ${origin} → LAX`,
      depLocal: "6:45 PM",
      judgment: "favorable",
      rows: [
        { label: "Booking check", value: "4 travelers", state: "unknown" },
        { label: "Recovery", value: "Poor", state: "poor" },
      ],
      footnote: "Last nonstop tonight",
    },
  ];
}

/** Screen 11 — the best way forward after widening from a stuck airport. */
export const widenedExample: ExampleFlight = {
  flightLabel: "UA1182 · DEN → LAX",
  depLocal: "3:15 PM",
  judgment: "favorable",
  rows: [
    { label: "Booking check", value: "4 travelers", state: "unknown" },
    { label: "Recovery", value: "Good", state: "good" },
  ],
  footnote: "3 later shots remain",
};

export const widenedAlternates = ["DEN → PHX → LAX", "DEN → SFO → LAX"];

/** Screen 12 — what the 1–4 public booking check actually is. */
export const bookingCheckLadder = [
  { party: "1 traveler", ok: true },
  { party: "2 travelers", ok: true },
  { party: "3 travelers", ok: true },
  { party: "4 travelers", ok: true },
];

/** Screen 13 — the check is useful across flights and over time. */
export const bookingCompare = [
  { flight: "UA101", value: "Booking open for 1" },
  { flight: "UA203", value: "Booking open for 4+" },
  { flight: "UA339", value: "Booking open for 2" },
];

export const bookingMovement = [
  { at: "10:00 AM", value: "Booking open for 4+" },
  { at: "1:30 PM", value: "Booking open for 2" },
];

/** Screen 14 — a reported load re-ranks the plan. */
export function rankingBefore(origin: string): string[] {
  return ["UA222", "AA1375", `Via DEN · ${origin} → DEN → LAX`];
}

export function rankingAfter(origin: string): string[] {
  return ["AA1375", "UA222", `Via DEN · ${origin} → DEN → LAX`];
}

/**
 * Screen 15 — the same load reads differently for different parties.
 * Numbers match computeLoadEvidence(4 open · 3 listed) with partyIncluded yes/no.
 */
export const partyReadings = [
  {
    who: "Solo traveler",
    detail: "1 traveler · already included in the 3 listed",
    emoji: "😐",
    verdict: "Worth considering",
    state: "fair" as PillarState,
    partySize: 1,
    partyIncluded: "yes" as const,
  },
  {
    who: "Family of 4",
    detail: "4 travelers · not included in the 3 listed",
    emoji: "😬",
    verdict: "Much tighter setup",
    state: "poor" as PillarState,
    partySize: 4,
    partyIncluded: "no" as const,
  },
];

/** Teaching load used by Screen 15 — keep in sync with partyReadings. */
export const teachingLoadExample = {
  openSeats: 4,
  standbys: 3,
} as const;

export const stateDot: Record<PillarState, string> = {
  good: "bg-fine",
  fair: "bg-watch",
  poor: "bg-rough",
  unknown: "bg-muted-foreground/50",
};

export const stateText: Record<PillarState, string> = {
  good: "text-fine-foreground",
  fair: "text-watch-foreground",
  poor: "text-rough-foreground",
  unknown: "text-muted-foreground",
};
