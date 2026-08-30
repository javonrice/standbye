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
  userAlreadyListed: boolean;
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
  const effectiveListed = load.alreadyListed
    ? (listedRaw ?? 0)
    : (listedRaw ?? 0) + partySize;
  const effectiveOpen = open;
  const cushion =
    effectiveOpen === null ? null : effectiveOpen - effectiveListed;
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
    userAlreadyListed: load.alreadyListed,
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
  if (cushion <= 0) return "poor";
  if (cushion <= 2) return "fair";
  return "good";
}

export function loadPillarFromEvidence(evidence: LoadEvidence): Pillar {
  const open = evidence.effectiveOpen ?? 0;
  const listed = evidence.effectiveListed ?? 0;
  const cushion = evidence.cushion;

  let state = cushionToAvailabilityState(cushion);
  let label = "Strong";
  if (state === "poor") label = "Oversubscribed";
  else if (state === "fair") label = "Tight";
  else if (cushion !== null && cushion <= 6) label = "Workable";

  const partyNote =
    !evidence.userAlreadyListed && evidence.partySize > 1
      ? ` (${evidence.partySize} travelers in your party counted against open seats)`
      : "";

  const detail =
    evidence.effectiveListed === null && evidence.effectiveOpen === null
      ? "Reported load on file."
      : evidence.userAlreadyListed || listed === 0
        ? `${open} open seat${open === 1 ? "" : "s"} reported${partyNote}.`
        : `${open} open seat${open === 1 ? "" : "s"} against ${listed} effective standby demand${partyNote}.`;

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
