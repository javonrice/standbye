/**
 * Internal load evidence for segment-scoped reported loads.
 * Never converted to boarding probability — only relative standby favorability.
 */
import type { AvailabilityEvidence, Pillar, PillarState, ReportedLoad } from "@/lib/aircue/standby";

export type LoadFreshnessTier = "very_strong" | "useful" | "stale";

export interface LoadEvidence {
  segmentKey: string;
  effectiveOpen: number | null;
  effectiveListed: number | null;
  cushion: number | null;
  partySize: number;
  partyIncluded: "yes" | "no" | "unsure" | null;
  sourceStrength: number;
  freshnessMinutes: number;
  freshnessTier: LoadFreshnessTier;
  freshnessMultiplier: number;
  cabin: string;
}

const SOURCE_STRENGTH: Record<string, number> = {
  employee_system: 1,
  stafftraveler: 0.9,
  gate_agent: 0.85,
};

/** Bounded nudge on top of availability pillar state — not a second full cushion pass. */
export const CUSHION_SCORE_CAP = 12;

export function cushionScoreAdjustment(
  cushion: number | null,
  freshnessMultiplier = 1,
): number {
  if (cushion === null) return 0;
  const scaled =
    cushion >= 0
      ? Math.min(CUSHION_SCORE_CAP, Math.round(cushion * 0.75))
      : Math.max(-CUSHION_SCORE_CAP, Math.floor(cushion * 0.75));
  return Math.round(scaled * freshnessMultiplier);
}

function freshnessFor(minutes: number): {
  tier: LoadFreshnessTier;
  multiplier: number;
} {
  if (minutes <= 30) return { tier: "very_strong", multiplier: 1 };
  if (minutes <= 120) return { tier: "useful", multiplier: 0.85 };
  if (minutes <= 360) return { tier: "useful", multiplier: 0.6 };
  return { tier: "stale", multiplier: 0.35 };
}

export function computeLoadEvidence(
  load: ReportedLoad,
  ctx: { partySize: number; now?: number },
): LoadEvidence {
  const partySize = Math.max(1, Math.floor(ctx.partySize));
  const open = load.openSeats;
  const listedRaw = load.standbys;

  let effectiveListed: number | null = null;
  let cushion: number | null = null;

  if (listedRaw === null) {
    // Unknown standby count is not zero demand.
    effectiveListed = null;
    cushion = null;
  } else if (load.partyIncluded === "unsure" || load.partyIncluded === null) {
    effectiveListed = null;
    cushion = null;
  } else if (open === null) {
    effectiveListed =
      load.partyIncluded === "yes" ? listedRaw : listedRaw + partySize;
    cushion = null;
  } else {
    effectiveListed =
      load.partyIncluded === "yes" ? listedRaw : listedRaw + partySize;
    cushion = open - effectiveListed;
  }

  const effectiveOpen = open;
  const checkedAt = Date.parse(load.checkedAt);
  const freshnessMinutes = Number.isFinite(checkedAt)
    ? Math.max(0, Math.round(((ctx.now ?? Date.now()) - checkedAt) / 60_000))
    : 9999;
  const fresh = freshnessFor(freshnessMinutes);
  const sourceStrength = SOURCE_STRENGTH[load.source] ?? 0.75;

  return {
    segmentKey: load.segmentKey,
    effectiveOpen,
    effectiveListed,
    cushion,
    partySize,
    partyIncluded: load.partyIncluded,
    sourceStrength,
    freshnessMinutes,
    freshnessTier: fresh.tier,
    freshnessMultiplier: fresh.multiplier,
    cabin: load.cabin,
  };
}

export function loadEvidenceMultiplier(evidence: LoadEvidence): number {
  return evidence.freshnessMultiplier * evidence.sourceStrength;
}

export function cushionToAvailabilityState(cushion: number | null): PillarState {
  if (cushion === null) return "unknown";
  if (cushion < 0) return "poor";
  if (cushion <= 2) return "fair";
  return "good";
}

export function loadPillarFromEvidence(evidence: LoadEvidence): Pillar {
  const open = evidence.effectiveOpen;
  const listed = evidence.effectiveListed;
  const cushion = evidence.cushion;
  const listedWasProvided = listed !== null;

  if (cushion === null) {
    const partyNote =
      evidence.partyIncluded === "no" && evidence.partySize > 1 && listedWasProvided
        ? ` (${evidence.partySize} travelers in your party counted against open seats)`
        : "";
    if (open !== null && !listedWasProvided) {
      return {
        key: "availability",
        state: "unknown",
        label: "Partial",
        detail: `${open} open seat${open === 1 ? "" : "s"} reported; standby count unavailable.`,
      };
    }
    if (open === null && listedWasProvided) {
      return {
        key: "availability",
        state: "unknown",
        label: "Partial",
        detail: `${listed} listed standby${listed === 1 ? "" : "s"} reported; open seat count unavailable${partyNote}.`,
      };
    }
    return {
      key: "availability",
      state: "unknown",
      label: "Partial",
      detail: "Reported load on file, but open seats and standby count are incomplete.",
    };
  }

  let state = cushionToAvailabilityState(cushion);
  let label = "Strong";
  if (state === "poor") label = "Oversubscribed";
  else if (state === "fair") label = "Tight";
  else if (cushion <= 6) label = "Workable";

  const partyNote =
    evidence.partyIncluded === "no" && evidence.partySize > 1
      ? ` (${evidence.partySize} travelers in your party counted against open seats)`
      : "";

  const openCount = open ?? 0;
  const detail =
    evidence.partyIncluded === "yes" || listed === 0
      ? `${openCount} open seat${openCount === 1 ? "" : "s"} reported${partyNote}.`
      : `${openCount} open seat${openCount === 1 ? "" : "s"} against ${listed} effective standby demand${partyNote}.`;

  return { key: "availability", state, label, detail };
}

/** @deprecated Prefer loadPillarFromEvidence — kept for callers passing raw ReportedLoad. */
export function loadPillarFromReported(
  load: ReportedLoad,
  partySize: number,
): Pillar {
  return loadPillarFromEvidence(computeLoadEvidence(load, { partySize }));
}

export function publicLoadSignalsDisagree(
  publicEvidence: AvailabilityEvidence,
  loadEvidence: LoadEvidence,
): boolean {
  if (!publicEvidence.checked) return false;
  const largest = publicEvidence.largestShowing;
  const loadState = cushionToAvailabilityState(loadEvidence.cushion);
  if (largest === null) return loadState === "good" || loadState === "poor";
  if (loadState === "poor" && largest >= 2) return true;
  if (loadState === "good" && loadEvidence.cushion !== null && loadEvidence.cushion >= 6 && largest <= 1) {
    return true;
  }
  return false;
}
