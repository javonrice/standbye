/**
 * Unified deterministic scoring for ranked options and load-driven plan resort.
 * Keeps ranking.server.ts and plan resort on the same weights/thresholds.
 */
import { applyAccessAwareScore } from "@/lib/aircue/access-scoring";
import {
  computeLoadEvidence,
  cushionToAvailabilityState,
  loadEvidenceMultiplier,
  loadPillarFromEvidence,
  type LoadEvidence,
} from "@/lib/aircue/load-evidence";
import { buildSegmentKey, type OptionKeySegment } from "@/lib/aircue/option-key";
import type {
  AvailabilityEvidence,
  Confidence,
  Judgment,
  Pillar,
  PillarState,
  ReportedLoad,
  StaffEligibility,
} from "@/lib/aircue/standby";

const stateScore: Record<PillarState, number> = { good: 30, fair: 16, poor: 0, unknown: 18 };

export function scoreFromPillars(
  pillars: Pillar[],
  access: import("@/lib/aircue/travel-access").AccessType | null = null,
  standbyClears = 1,
  loadMultiplier = 1,
): number {
  const at = (key: string) => pillars.find((p) => p.key === key)?.state ?? "unknown";
  const availabilityScore = stateScore[at("availability")] * 1.2 * loadMultiplier;
  const raw =
    availabilityScore +
    stateScore[at("operations")] * 1.0 +
    stateScore[at("recovery")] * 0.8 +
    stateScore[at("history")] * 0.4;
  const base = Math.round((raw / (30 * 3.4)) * 100);
  return applyAccessAwareScore(base, access, standbyClears);
}

export function judgmentFromScore(
  score: number,
  availability: PillarState,
  recovery: PillarState,
): Judgment {
  if (availability === "poor" && recovery === "poor") return "riskier";
  if (availability === "poor") return score >= 76 ? "mixed" : "riskier";
  if (score >= 76) return "favorable";
  if (score >= 52) return "mixed";
  return "riskier";
}

export function confidenceFromPillars(
  pillars: Pillar[],
  hasSegmentLoad: boolean,
  staffEligibility: StaffEligibility = "uncertain",
  hasPartialLoad = false,
): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  if (hasPartialLoad) {
    if (staffEligibility === "eligible") return "medium";
    return "low";
  }
  if (staffEligibility === "uncertain" && unknowns >= 1) return "low";
  if (hasSegmentLoad && unknowns <= 1 && staffEligibility === "eligible") return "high";
  if (hasSegmentLoad && unknowns <= 1) return "medium";
  if (unknowns >= 2) return "low";
  return staffEligibility === "uncertain" ? "medium" : "medium";
}

function worstPillar(a: Pillar, b: Pillar): Pillar {
  const state = worstState(a.state, b.state);
  return {
    key: "availability",
    state,
    label: state === b.state ? b.label : a.label,
    detail: a.detail.includes("across") ? a.detail : b.detail || a.detail,
  };
}

function availabilityFromSegmentLoad(
  publicPillar: Pillar,
  load: ReportedLoad | null | undefined,
  partySize: number,
  now?: number,
): {
  displayPillar: Pillar;
  rankingPillar: Pillar;
  evidence: LoadEvidence | null;
  loadMultiplier: number;
  hasLoad: boolean;
  isPartial: boolean;
  worstCushion: number | null;
} {
  if (!load) {
    return {
      displayPillar: publicPillar,
      rankingPillar: publicPillar,
      evidence: null,
      loadMultiplier: 1,
      hasLoad: false,
      isPartial: false,
      worstCushion: null,
    };
  }

  const evidence = computeLoadEvidence(load, {
    partySize,
    ...(now !== undefined ? { now } : {}),
  });
  const displayPillar = loadPillarFromEvidence(evidence);
  const isPartial = evidence.cushion === null;

  return {
    displayPillar,
    rankingPillar: isPartial ? publicPillar : displayPillar,
    evidence,
    loadMultiplier: isPartial ? 1 : loadEvidenceMultiplier(evidence),
    hasLoad: true,
    isPartial,
    worstCushion: evidence.cushion,
  };
}

const worstState = (a: PillarState, b: PillarState): PillarState => {
  const order: PillarState[] = ["poor", "fair", "unknown", "good"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
};

export function segmentKeyFromParts(segment: OptionKeySegment): string {
  return buildSegmentKey(segment);
}

export interface SegmentAvailabilityInput {
  segment: OptionKeySegment;
  publicPillar: Pillar;
  load: ReportedLoad | null | undefined;
  partySize: number;
  now?: number;
}

/** Worst leg wins for connections — complete load on one segment overrides that leg only. */
export function availabilityPillarForSegments(
  legs: SegmentAvailabilityInput[],
): {
  pillar: Pillar;
  rankingPillar: Pillar;
  loadEvidence: LoadEvidence | null;
  loadMultiplier: number;
  hasLoad: boolean;
  hasPartialLoad: boolean;
  worstCushion: number | null;
  primaryLoad: ReportedLoad | null;
} {
  let displayWorst: Pillar | null = null;
  let rankingWorst: Pillar | null = null;
  let combinedEvidence: LoadEvidence | null = null;
  let multiplier = 1;
  let hasLoad = false;
  let hasPartialLoad = false;
  let worstCushion: number | null = null;
  let primaryLoad: ReportedLoad | null = null;

  for (const leg of legs) {
    const legResult = availabilityFromSegmentLoad(
      leg.publicPillar,
      leg.load,
      leg.partySize,
      leg.now,
    );

    if (legResult.hasLoad) {
      hasLoad = true;
      primaryLoad = leg.load ?? null;
      if (legResult.isPartial) hasPartialLoad = true;
      if (
        legResult.evidence &&
        (!combinedEvidence || legResult.evidence.freshnessMinutes < combinedEvidence.freshnessMinutes)
      ) {
        combinedEvidence = legResult.evidence;
      }
      if (legResult.worstCushion !== null) {
        worstCushion =
          worstCushion === null ? legResult.worstCushion : Math.min(worstCushion, legResult.worstCushion);
      }
      if (!legResult.isPartial) {
        multiplier = Math.min(multiplier, legResult.loadMultiplier);
      }
    }

    if (!displayWorst) {
      displayWorst = legResult.displayPillar;
      rankingWorst = legResult.rankingPillar;
    } else {
      displayWorst = worstPillar(displayWorst!, legResult.displayPillar);
      rankingWorst = worstPillar(rankingWorst!, legResult.rankingPillar);
    }
  }

  const fallback: Pillar = {
    key: "availability",
    state: "unknown",
    label: "Not available",
    detail: "",
  };
  let pillar = displayWorst ?? fallback;
  const rankingPillar = rankingWorst ?? fallback;

  if (legs.length > 1 && hasLoad) {
    pillar = {
      ...pillar,
      detail: `${pillar.label} across ${legs.length} clears (reported loads where available).`,
    };
  }

  return {
    pillar,
    rankingPillar,
    loadEvidence: combinedEvidence,
    loadMultiplier: worstCushion !== null ? multiplier : 1,
    hasLoad,
    hasPartialLoad,
    worstCushion,
    primaryLoad,
  };
}

export function rescoreOptionPillars(input: {
  pillars: Pillar[];
  segments: OptionKeySegment[];
  publicAvailability: Pillar;
  loadsBySegment: Map<string, ReportedLoad>;
  partySize: number;
  access: import("@/lib/aircue/travel-access").AccessType | null;
  standbyClears: number;
  staffEligibility?: StaffEligibility;
  now?: number;
}): {
  pillars: Pillar[];
  score: number;
  judgment: Judgment;
  confidence: Confidence;
  loadEvidence: LoadEvidence | null;
  signalsDisagree: boolean;
  publicAvailability: AvailabilityEvidence | null;
} {
  const legs: SegmentAvailabilityInput[] = input.segments.map((segment) => ({
    segment,
    publicPillar: input.publicAvailability,
    load: input.loadsBySegment.get(buildSegmentKey(segment)) ?? null,
    partySize: input.partySize,
    ...(input.now !== undefined ? { now: input.now } : {}),
  }));

  const { pillar: availability, rankingPillar, loadEvidence, loadMultiplier, hasLoad, hasPartialLoad } =
    availabilityPillarForSegments(legs);

  const pillars = input.pillars.map((p) => (p.key === "availability" ? availability : p));
  const scorePillars = input.pillars.map((p) => (p.key === "availability" ? rankingPillar : p));
  const score = scoreFromPillars(scorePillars, input.access, input.standbyClears, loadMultiplier);
  const judgment = judgmentFromScore(
    score,
    rankingPillar.state,
    pillars.find((p) => p.key === "recovery")?.state ?? "unknown",
  );
  const confidence = confidenceFromPillars(
    pillars,
    hasLoad,
    input.staffEligibility ?? "uncertain",
    hasPartialLoad,
  );

  return {
    pillars,
    score,
    judgment,
    confidence,
    loadEvidence,
    signalsDisagree: false,
    publicAvailability: null,
  };
}
