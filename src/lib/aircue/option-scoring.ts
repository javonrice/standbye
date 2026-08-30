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
  if (score >= 76) return "favorable";
  if (score >= 52) return "mixed";
  return "riskier";
}

export function confidenceFromPillars(
  pillars: Pillar[],
  hasSegmentLoad: boolean,
  staffEligibility: StaffEligibility = "uncertain",
): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  if (staffEligibility === "uncertain" && unknowns >= 1) return "low";
  if (hasSegmentLoad && unknowns <= 1 && staffEligibility === "eligible") return "high";
  if (hasSegmentLoad && unknowns <= 1) return "medium";
  if (unknowns >= 2) return "low";
  return staffEligibility === "uncertain" ? "medium" : "medium";
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

/** Worst leg wins for connections — load on one segment overrides that leg only. */
export function availabilityPillarForSegments(
  legs: SegmentAvailabilityInput[],
): { pillar: Pillar; loadEvidence: LoadEvidence | null; loadMultiplier: number; hasLoad: boolean } {
  let worst: Pillar | null = null;
  let combinedEvidence: LoadEvidence | null = null;
  let multiplier = 1;
  let hasLoad = false;

  for (const leg of legs) {
    let legPillar = leg.publicPillar;
    let legEvidence: LoadEvidence | null = null;
    let legMultiplier = 1;

    if (leg.load) {
      legEvidence = computeLoadEvidence(leg.load, { partySize: leg.partySize, now: leg.now });
      legPillar = loadPillarFromEvidence(legEvidence);
      legMultiplier = loadEvidenceMultiplier(legEvidence);
      hasLoad = true;
      if (!combinedEvidence || legEvidence.freshnessMinutes < combinedEvidence.freshnessMinutes) {
        combinedEvidence = legEvidence;
      }
    }

    if (!worst) worst = legPillar;
    else {
      worst = {
        key: "availability",
        state: worstState(worst.state, legPillar.state),
        label: worstState(worst.state, legPillar.state) === legPillar.state ? legPillar.label : worst.label,
        detail:
          legs.length > 1
            ? `${worst.label} overall across ${legs.length} clears.`
            : legPillar.detail,
      };
    }
    multiplier = Math.min(multiplier, legMultiplier);
  }

  return {
    pillar: worst ?? { key: "availability", state: "unknown", label: "Not available", detail: "" },
    loadEvidence: combinedEvidence,
    loadMultiplier: hasLoad ? multiplier : 1,
    hasLoad,
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
    now: input.now,
  }));

  const { pillar: availability, loadEvidence, loadMultiplier, hasLoad } =
    availabilityPillarForSegments(legs);

  const pillars = input.pillars.map((p) => (p.key === "availability" ? availability : p));
  const score = scoreFromPillars(pillars, input.access, input.standbyClears, loadMultiplier);
  const judgment = judgmentFromScore(
    score,
    availability.state,
    pillars.find((p) => p.key === "recovery")?.state ?? "unknown",
  );
  const confidence = confidenceFromPillars(
    pillars,
    hasLoad,
    input.staffEligibility ?? "uncertain",
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
