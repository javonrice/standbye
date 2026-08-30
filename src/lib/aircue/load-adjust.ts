/**
 * Employee-reported loads are stronger evidence than public availability, so
 * they override the availability pillar and can move the judgment.
 */
import { computeLoadEvidence, loadPillarFromEvidence } from "@/lib/aircue/load-evidence";
import {
  confidenceFromPillars,
  judgmentFromScore,
  scoreFromPillars,
} from "@/lib/aircue/option-scoring";
import type { Judgment, Pillar, PillarState, ReportedLoad, Confidence } from "@/lib/aircue/standby";

export function loadPillar(load: ReportedLoad, partySize = 1): Pillar {
  return loadPillarFromEvidence(computeLoadEvidence(load, { partySize }));
}

/** Recompute judgment/confidence after loads are applied to pillars. */
export function judgeWithLoad(
  pillars: Pillar[],
  access: import("@/lib/aircue/travel-access").AccessType | null = null,
  standbyClears = 1,
  loadMultiplier = 1,
): Judgment {
  const score = scoreFromPillars(pillars, access, standbyClears, loadMultiplier);
  const availability = pillars.find((p) => p.key === "availability")?.state ?? "unknown";
  const recovery = pillars.find((p) => p.key === "recovery")?.state ?? "unknown";
  return judgmentFromScore(score, availability, recovery);
}

export function confidenceWithLoad(
  pillars: Pillar[],
  hasLoad = true,
  staffEligibility: import("@/lib/aircue/standby").StaffEligibility = "uncertain",
): Confidence {
  return confidenceFromPillars(pillars, hasLoad, staffEligibility);
}

export { scoreFromPillars, judgmentFromScore, confidenceFromPillars };
