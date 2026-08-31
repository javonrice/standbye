/**
 * Client-safe vocabulary for the Standbye standby decision engine.
 *
 * Standbye never shows a boarding probability. Internally options carry a score;
 * the customer only ever sees a judgment label, four pillar states, and plain
 * reasons.
 */

/** The judgment a traveller sees. */
export type Judgment = "favorable" | "mixed" | "riskier" | "changed";

/** Pillar state. `unknown` means we could not check — never "bad". */
export type PillarState = "good" | "fair" | "poor" | "unknown";

export type PillarKey = "availability" | "operations" | "history" | "recovery";

export type Confidence = "low" | "medium" | "high";

export interface Pillar {
  key: PillarKey;
  state: PillarState;
  /** Two or three words, e.g. "Strong", "Normal", "Tighter". */
  label: string;
  /** One sentence, plain language. */
  detail: string;
}

export interface Reason {
  key: string;
  state: PillarState;
  title: string;
  detail: string;
}

export interface OptionSegment {
  carrier: string;
  flightNumber: string;
  flightLabel: string;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  schedDepUtc: string;
  /** Scheduled arrival ISO-ish when known (local-naive or absolute). */
  schedArrUtc?: string | null;
  /** Arrival local calendar day minus departure local calendar day, when known. */
  arrivalDayOffset?: number | null;
  /** Provisional access from marketing carrier (pre-verify) or operator (post-verify). */
  access?: import("@/lib/aircue/travel-access").AccessType | null;
  /** Raw provider/board status when known (e.g. Cancelled). */
  status?: string | null;
}

export type StaffEligibility = import("@/lib/aircue/staff-eligibility").StaffEligibility;
export type OperatorVerification = import("@/lib/aircue/staff-eligibility").OperatorVerification;

export interface CommercialFare {
  amount: number;
  currency: string;
  bookingUrl?: string | null;
}

export interface AvailabilityEvidence {
  checked: boolean;
  /** Party sizes we tested and whether booking was still showing. */
  tested: Array<{ adults: number; showing: boolean }>;
  largestShowing: number | null;
  checkedAt: string | null;
  reason?: string;
}

export interface ConditionsEvidence {
  airport: string;
  faa: string;
  delays: string;
  weather: string;
  forecast: string | null;
  forecastState: PillarState;
  note: string;
  /** FAA NAS coverage for this airport's country/region. */
  faaCoverage?: import("@/lib/aircue/coverage").CoverageState;
  weatherCoverage?: import("@/lib/aircue/coverage").CoverageState;
}

export interface HistoryEvidence {
  monthLabel: string;
  carrierLabel: string;
  summary: string;
  loadIndex: number | null;
  cancelPattern: string;
  delayPattern: string;
  sourcePeriod: string | null;
  /** History source coverage for this route/carrier window. */
  historyCoverage?: import("@/lib/aircue/coverage").CoverageState;
}

export interface HolidayEvidence {
  country: string;
  name: string;
  date: string;
  note: string;
}

export interface RecoveryEvidence {
  state: PillarState;
  label: string;
  summary: string;
  hoursRemaining: number | null;
  laterNonstops: Array<{ flightLabel: string; depLocal: string; judgment: Judgment }>;
  alternates: Array<{
    routing: string;
    depLocal: string;
    judgment: Judgment;
    note: string;
    /** Set when the alternate is a gateway we can open. */
    hub?: string;
  }>;
}

export interface ReportedLoad {
  id: string;
  /** Canonical segment identity — one leg of an option_key. */
  segmentKey: string;
  /** Display-only; not used for load lookup. */
  flightLabel: string;
  openSeats: number | null;
  standbys: number | null;
  cabin: string;
  source: string;
  /** Whether the reporter's party is already counted in standbys. */
  partyIncluded: "yes" | "no" | "unsure" | null;
  checkedAt: string;
}

/** What the plan is for — a normal standby search, or an Escape route search. */
export type PlanMode = "standby" | "escape";

/** How wide the traveller wants Standbye to cast the net. */
export type RoutingMode = "best" | "nonstop" | "wide";

export const routingModeLabel: Record<RoutingMode, string> = {
  best: "Best options",
  nonstop: "Nonstop only",
  wide: "Any reasonable route",
};

export const routingModeHint: Record<RoutingMode, string> = {
  best: "Nonstop + sensible connections",
  nonstop: "Only direct flights",
  wide: "Show me more ways to get there",
};

/**
 * A shot is a flight the traveller could realistically still attempt while
 * making progress toward the destination.
 */
export interface Shot {
  flightLabel: string;
  depLocal: string;
  judgment: Judgment;
}

/** A connecting city, judged on the ways in and the ways onward. */
export interface GatewayOption {
  hub: string;
  city: string | null;
  state: PillarState;
  /** "Strong alternate", "Possible", "Weak today". */
  label: string;
  summary: string;
  inboundShots: Shot[];
  onwardDepartures: string[];
  onwardCount: number;
  recoveryState: PillarState;
  recoveryLabel: string;
  /** Honest downside, e.g. a backtrack or unstable operations today. */
  caveat: string | null;
  addedMinutes: number | null;
}

export const gatewayDot: Record<PillarState, string> = {
  good: "🟢",
  fair: "🟡",
  poor: "🔴",
  unknown: "⚪️",
};

export interface StandbyOption {
  id: string;
  planId: string;
  rank: number;
  kind: "nonstop" | "connection";
  judgment: Judgment;
  confidence: Confidence;
  headline: string;
  flightLabel: string;
  /** Deterministic itinerary identity; null on legacy rows until next sync. */
  optionKey: string | null;
  carrier: string | null;
  flightNumber: string | null;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  schedDepUtc: string | null;
  /** Scheduled arrival ISO when persisted; used for local day-offset display. */
  schedArrUtc?: string | null;
  segments: OptionSegment[];
  pillars: Pillar[];
  reasons: Reason[];
  evidence: {
    availability: AvailabilityEvidence;
    conditions: ConditionsEvidence | null;
    history: HistoryEvidence | null;
    holiday: HolidayEvidence | null;
    recovery: RecoveryEvidence;
    /** Arrival local calendar days after departure local calendar day. */
    arrivalDayOffset?: number | null;
    /** Itinerary-level access (worst segment), when known. */
    access?: import("@/lib/aircue/travel-access").AccessType | null;
    staffEligibility?: StaffEligibility;
    operatorVerification?: OperatorVerification;
    commercialFare?: CommercialFare | null;
    standbyClears?: number;
  };
  load: ReportedLoad | null;
  refreshedAt: string;
  access?: import("@/lib/aircue/travel-access").AccessType | null;
  staffEligibility?: StaffEligibility;
  operatorVerification?: OperatorVerification;
  commercialFare?: CommercialFare | null;
  standbyClears?: number;
}

export interface StandbyPlan {
  id: string;
  origin: string;
  dest: string;
  travelDate: string;
  travelers: number;
  cabin: string;
  options: StandbyOption[];
  /** True when every option carries a meaningful tradeoff. */
  noStrongSetup: boolean;
  /** Set when the search found nothing, explaining why in plain terms. */
  emptyReason: "no_service" | "day_over" | "carrier_filter" | "data_unavailable" | null;
  /** Airports the search actually covered, primary first. */
  scannedAirports: { origins: string[]; dests: string[] };
  /** Connecting cities worth committing to, strongest first. */
  gateways: GatewayOption[];
  /** Viable ordered airport paths discovered for this plan (Every Way There). */
  strategies: import("@/lib/aircue/plan-strategy").PlanStrategy[];
  /** Whether strategy discovery saw a complete network snapshot for this plan day. */
  strategyDiscovery: import("@/lib/aircue/plan-strategy").StrategyDiscoveryMeta;
  routingMode: RoutingMode;
  /** Escape plans search a much wider network of intermediate stations. */
  mode: PlanMode;
  /** True when this escape shares an existing Standby Day for the same route/date. */
  standbyDayShared: boolean;
  /** Traveler's chosen primary option, if any. */
  primaryOptionId: string | null;
  /** Active watch on this plan, if any. */
  watching: boolean;
  watchId: string | null;
  planVerdict: string | null;
  lastCheckedAt: string | null;
  /** When the monitor is next scheduled to look, if watching. */
  nextCheckAt: string | null;
  /** Rank-1 option after latest rank (Standbye's current preference). */
  preferredOptionId: string | null;
  backupRunway: {
    totalRealisticWays: number;
    backupAlternatives: number;
    nonstops: number;
    connections: number;
    summary: string;
    /** Alias of totalRealisticWays for older callers. */
    total: number;
    homeCount?: number;
    zedCount?: number;
    otherCount?: number;
  };
  /** Set after a reported load changes rank #1; cleared on next plan read after display. */
  loadResortNotice?: { headline: string; detail: string } | null;
  /** Backend lifecycle — orthogonal to calendar travelDate grouping. */
  lifecycleStatus?: "active" | "complete";
  lifecycleResolvedAt?: string | null;
  /** Whether the plan still has actionable options in its travel window. */
  isActionable?: boolean;
}

export const judgmentFace: Record<Judgment, string> = {
  favorable: "🙂",
  mixed: "😐",
  riskier: "😬",
  changed: "🚨",
};

export const judgmentTitle: Record<Judgment, string> = {
  favorable: "Favorable setup",
  mixed: "Mixed setup",
  riskier: "Take another look",
  changed: "Plan changed",
};

/** One-word version used in dense, scannable lists. */
export const judgmentShort: Record<Judgment, string> = {
  favorable: "Favorable",
  mixed: "Mixed",
  riskier: "Riskier",
  changed: "Changed",
};

/** Tailwind token families for each judgment. */
export const judgmentTone: Record<Judgment, { text: string; bg: string; ring: string }> = {
  favorable: { text: "text-fine-foreground", bg: "bg-fine-soft", ring: "ring-fine/40" },
  mixed: { text: "text-watch-foreground", bg: "bg-watch-soft", ring: "ring-watch/40" },
  riskier: { text: "text-rough-foreground", bg: "bg-rough-soft", ring: "ring-rough/40" },
  changed: { text: "text-rough-foreground", bg: "bg-rough-soft", ring: "ring-rough/60" },
};

export const pillarTitle: Record<PillarKey, string> = {
  availability: "Booking check",
  operations: "Operations",
  history: "Route history",
  recovery: "Backup runway",
};


export const pillarDot: Record<PillarState, string> = {
  good: "bg-fine",
  fair: "bg-watch",
  poor: "bg-rough",
  unknown: "bg-muted-foreground/40",
};

export const confidenceLabel: Record<Confidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const loadSourceLabel: Record<string, string> = {
  employee_system: "Employee system",
  stafftraveler: "StaffTraveler",
  coworker: "Friend / coworker",
  other: "Other",
  screenshot: "Screenshot",
  network_snapshot: "Standbye network",
};

export function minutesAgo(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 60000));
}

/** "2 min ago", "3h 12m ago", "just now". */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  const mins = minutesAgo(iso, now);
  if (mins === null) return "not checked yet";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

/** A reported load older than this deserves a nudge. */
export const STALE_LOAD_MINUTES = 120;

export function loadIsStale(load: ReportedLoad | null, now = Date.now()): boolean {
  if (!load) return false;
  const mins = minutesAgo(load.checkedAt, now);
  return mins !== null && mins >= STALE_LOAD_MINUTES;
}

export const travelerTypes = [
  { value: "employee", label: "Employee" },
  { value: "spouse", label: "Spouse / dependent" },
  { value: "retiree", label: "Retiree" },
  { value: "buddy", label: "Buddy / companion" },
  { value: "other", label: "Other" },
] as const;
