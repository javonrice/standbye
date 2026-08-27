/** PRD status model: Clear, Watch, Elevated, Active disruption, Incomplete. */
export type BriefStatus = "clear" | "watch" | "elevated" | "disruption" | "incomplete";

/** PRD confidence classes. */
export type Confidence = "confirmed" | "strong" | "context";

export type SignalCategory =
  | "weather"
  | "airport"
  | "faa"
  | "event"
  | "holiday"
  | "aircraft"
  | "cancellation"
  | "flight";

export type SignalLocation = "departure" | "arrival" | "chain";

export interface Signal {
  id: string;
  category: SignalCategory;
  location: SignalLocation;
  /** Short label, e.g. "Arrival weather". */
  title: string;
  /** The detected condition, one line. */
  detail: string;
  /** Why it matters for a standby attempt. */
  why: string;
  confidence: Confidence;
  level: BriefStatus;
  /** Evidence: where it came from and when it was last checked. */
  source: string;
  updated: string;
}

export interface BriefSection {
  label: string;
  place: string;
  code: string;
  status: BriefStatus;
  summary: string;
  signals: Signal[];
  /** Categories that could not be checked at the last run. */
  unavailable?: string[];
}

export interface ChangeEntry {
  id: string;
  time: string;
  text: string;
}

export interface Brief {
  id: string;
  tripName: string;
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  date: string;
  departsLocal: string;
  arrivesLocal: string;
  countdown: string;
  status: BriefStatus;
  /** Standby pressure index, 0-100. Never a seat probability. */
  pressure: number;
  /** Standby outlook headline, fixed-template copy. */
  outlook: string;
  /** Standby impact: why the strongest signals may matter. */
  impact: string;
  generatedAt: string;
  changes: ChangeEntry[];
  departure: BriefSection;
  arrival: BriefSection;
  chain: {
    summary: string;
    status: BriefStatus;
    signals: Signal[];
    unavailable?: string[];
  };
  watch?: {
    active: boolean;
    nextCheck: string;
    cadence: string;
    expires: string;
    email: string;
  };
  shareToken?: string;
}

export const disclaimer =
  "Aircue does not include airline load data, standby priority, or a prediction that you will receive a seat. Conditions are informational and may change. Aircue is not affiliated with any airline, the FAA, or a data provider.";

/** One-sentence, user-facing meaning for each status. */
export const statusMeaning: Record<BriefStatus, string> = {
  clear: "No meaningful outside pressure found at last check. Not a seat prediction.",
  watch: "Something is developing. Keep an eye on it.",
  elevated: "Outside conditions may make this attempt harder.",
  disruption: "A real operational problem is happening now.",
  incomplete: "We don’t have enough live data to judge.",
};

export const searchDisclaimer =
  "Aircue does not show seats, list position, or whether you will clear.";

export function allSignals(brief: Brief): Signal[] {
  return [
    ...(brief.departure.signals ?? []),
    ...(brief.arrival.signals ?? []),
    ...(brief.chain.signals ?? []),
  ];
}

export function getSignal(brief: Brief, signalId: string): Signal | undefined {
  return allSignals(brief).find((s) => s.id === signalId);
}

export function missingSources(brief: Brief): string[] {
  return [
    ...(brief.departure.unavailable ?? []),
    ...(brief.arrival.unavailable ?? []),
    ...(brief.chain.unavailable ?? []),
  ];
}
