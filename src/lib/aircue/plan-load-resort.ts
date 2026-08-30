/**
 * Load-aware local rescore/resort for persisted plan options (no provider calls).
 */
import { computeLoadEvidence, loadEvidenceMultiplier, loadPillarFromEvidence } from "@/lib/aircue/load-evidence";
import { buildSegmentKey, segmentKeysFromOptionKey, type OptionKeySegment } from "@/lib/aircue/option-key";
import {
  confidenceFromPillars,
  judgmentFromScore,
  scoreFromPillars,
} from "@/lib/aircue/option-scoring";
import type {
  Confidence,
  Judgment,
  Pillar,
  PillarState,
  ReportedLoad,
  StaffEligibility,
} from "@/lib/aircue/standby";
import type { AccessType } from "@/lib/aircue/travel-access";

type Row = Record<string, unknown>;

const worstState = (a: PillarState, b: PillarState): PillarState => {
  const order: PillarState[] = ["poor", "fair", "unknown", "good"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
};

function worstPillar(a: Pillar, b: Pillar): Pillar {
  const state = worstState(a.state, b.state);
  return {
    key: "availability",
    state,
    label: state === b.state ? b.label : a.label,
    detail: a.detail.includes("across") ? a.detail : b.detail || a.detail,
  };
}

export function segmentsFromRow(row: Row): OptionKeySegment[] {
  const stored = (row["segments"] as OptionKeySegment[] | null) ?? [];
  if (stored.length > 0) {
    return stored.map((s) => ({
      carrier: s.carrier,
      flightNumber: s.flightNumber,
      origin: s.origin,
      dest: s.dest,
      schedDepUtc: s.schedDepUtc,
      depLocal: s.depLocal,
    }));
  }
  const optionKey = String(row["option_key"] ?? "").trim();
  const keys = segmentKeysFromOptionKey(optionKey);
  if (keys.length === 0) {
    return [
      {
        carrier: row["carrier"] as string | null,
        flightNumber: row["flight_number"] as string | null,
        origin: String(row["origin_iata"] ?? ""),
        dest: String(row["dest_iata"] ?? ""),
        schedDepUtc: row["sched_dep_utc"] as string | null,
        depLocal: row["dep_local"] as string | null,
      },
    ];
  }
  return keys.map((key) => {
    const [head, od, dep] = key.split(":");
    const match = head?.match(/^([A-Z0-9]{2})(\d+)$/i);
    const [origin, dest] = (od ?? "").split("-");
    return {
      carrier: match?.[1] ?? null,
      flightNumber: match?.[2] ?? null,
      origin: origin ?? String(row["origin_iata"] ?? ""),
      dest: dest ?? String(row["dest_iata"] ?? ""),
      schedDepUtc: dep && !dep.startsWith("LOCAL") ? `${dep}:00Z` : (row["sched_dep_utc"] as string | null),
      depLocal: dep?.startsWith("LOCAL:") ? dep.slice(6) : (row["dep_local"] as string | null),
    };
  });
}

export function availabilityPillarWithSegmentLoads(input: {
  segments: OptionKeySegment[];
  publicPillar: Pillar;
  loadsBySegment: Map<string, ReportedLoad>;
  partySize: number;
  now?: number;
}): { pillar: Pillar; loadMultiplier: number; hasLoad: boolean; primaryLoad: ReportedLoad | null; worstCushion: number | null } {
  let pillar = input.publicPillar;
  let loadMultiplier = 1;
  let hasLoad = false;
  let primaryLoad: ReportedLoad | null = null;
  let worstCushion: number | null = null;

  for (const segment of input.segments) {
    const key = buildSegmentKey(segment);
    const load = input.loadsBySegment.get(key);
    if (!load) {
      if (input.segments.length > 1) {
        pillar = worstPillar(pillar, input.publicPillar);
      }
      continue;
    }
    const evidence = computeLoadEvidence(load, {
      partySize: input.partySize,
      ...(input.now !== undefined ? { now: input.now } : {}),
    });
    const loadPillar = loadPillarFromEvidence(evidence);
    pillar = input.segments.length > 1 ? worstPillar(pillar, loadPillar) : loadPillar;
    loadMultiplier = Math.min(loadMultiplier, loadEvidenceMultiplier(evidence));
    hasLoad = true;
    primaryLoad = load;
    if (evidence.cushion !== null) {
      worstCushion =
        worstCushion === null ? evidence.cushion : Math.min(worstCushion, evidence.cushion);
    }
  }

  if (input.segments.length > 1 && hasLoad) {
    pillar = {
      ...pillar,
      detail: `${pillar.label} across ${input.segments.length} clears (reported loads where available).`,
    };
  }

  return { pillar, loadMultiplier, hasLoad, primaryLoad, worstCushion };
}

export function rescoreStoredOption(input: {
  row: Row;
  loadsBySegment: Map<string, ReportedLoad>;
  partySize: number;
  now?: number;
}): {
  pillars: Pillar[];
  score: number;
  judgment: Judgment;
  confidence: Confidence;
  primaryLoad: ReportedLoad | null;
} {
  const pillars = ((input.row["pillars"] as Pillar[]) ?? []).slice();
  const publicPillar =
    pillars.find((p) => p.key === "availability") ??
    ({ key: "availability", state: "unknown", label: "Not available", detail: "" } as Pillar);
  const segments = segmentsFromRow(input.row);
  const evidence = (input.row["evidence"] as Record<string, unknown> | null) ?? {};
  const access = (evidence["access"] as AccessType | null | undefined) ?? null;
  const standbyClears =
    typeof evidence["standbyClears"] === "number"
      ? Number(evidence["standbyClears"])
      : Math.max(1, segments.length);
  const staffEligibility = (evidence["staffEligibility"] as StaffEligibility | undefined) ?? "uncertain";

  const { pillar, loadMultiplier, hasLoad, primaryLoad, worstCushion } = availabilityPillarWithSegmentLoads({
    segments,
    publicPillar,
    loadsBySegment: input.loadsBySegment,
    partySize: input.partySize,
    ...(input.now !== undefined ? { now: input.now } : {}),
  });

  const effective = pillars.map((p) => (p.key === "availability" ? pillar : p));
  // Partial loads stay visible as Partial/unknown but score conservatively — no fake cushion.
  const scorePillars =
    hasLoad && worstCushion === null
      ? effective.map((p) =>
          p.key === "availability" ? { ...p, state: "poor" as const } : p,
        )
      : effective;
  // Cushion is reflected in the availability pillar state; do not add a second raw cushion pass.
  const scoreBase = scoreFromPillars(
    scorePillars,
    access,
    standbyClears,
    hasLoad ? loadMultiplier : 1,
  );
  const score = Math.max(0, Math.min(100, scoreBase));
  const judgment = judgmentFromScore(
    score,
    pillar.state,
    effective.find((p) => p.key === "recovery")?.state ?? "unknown",
  );
  const confidence = confidenceFromPillars(effective, hasLoad, staffEligibility);

  return { pillars: effective, score, judgment, confidence, primaryLoad };
}

export interface ResortResult {
  options: Array<{
    id: string;
    rank: number;
    score: number;
    judgment: Judgment;
    confidence: Confidence;
    pillars: Pillar[];
    primaryLoad: ReportedLoad | null;
  }>;
  previousPreferredId: string | null;
  newPreferredId: string | null;
  bestOptionChanged: boolean;
}

export function resortScoredOptions(
  scored: Array<{
    id: string;
    score: number;
    schedDepUtc: string | null;
    judgment: Judgment;
    confidence: Confidence;
    pillars: Pillar[];
    primaryLoad: ReportedLoad | null;
  }>,
  previousPreferredId: string | null,
): ResortResult {
  const sorted = [...scored].sort(
    (a, b) =>
      b.score - a.score ||
      String(a.schedDepUtc ?? "").localeCompare(String(b.schedDepUtc ?? "")),
  );
  const options = sorted.map((row, index) => ({
    id: row.id,
    rank: index + 1,
    score: row.score,
    judgment: row.judgment,
    confidence: row.confidence,
    pillars: row.pillars,
    primaryLoad: row.primaryLoad,
  }));
  const newPreferredId = options[0]?.id ?? null;
  return {
    options,
    previousPreferredId,
    newPreferredId,
    bestOptionChanged: Boolean(
      previousPreferredId && newPreferredId && previousPreferredId !== newPreferredId,
    ),
  };
}
