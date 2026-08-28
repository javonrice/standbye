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

export function recoveryExample(origin: string): ExampleFlight[] {
  return [
    {
      flightLabel: `UA222 · ${origin} → LAX`,
      depLocal: "7:10 AM",
      judgment: "favorable",
      rows: [
        { label: "Availability", value: "Mixed", state: "fair" },
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
        { label: "Availability", value: "Strong", state: "good" },
        { label: "Recovery", value: "Poor", state: "poor" },
      ],
      footnote: "Last nonstop tonight",
    },
  ];
}

export function noLoadExample(origin: string): ExampleFlight {
  return {
    flightLabel: `AA1375 · ${origin} → LAX`,
    depLocal: "11:20 AM",
    judgment: "favorable",
    rows: [
      { label: "Reported load", value: "—", state: "unknown" },
      { label: "Public availability", value: "Strong", state: "good" },
      { label: "Operations", value: "Normal", state: "good" },
      { label: "Recovery", value: "Good", state: "good" },
    ],
    footnote: "Confidence: Medium",
  };
}

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
