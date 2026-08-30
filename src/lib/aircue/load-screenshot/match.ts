/**
 * Match extracted flight rows to canonical segment keys on a plan/board.
 */
import { buildSegmentKey, type OptionKeySegment } from "@/lib/aircue/option-key";
import type { ExtractedFlightLoad } from "@/lib/aircue/load-screenshot/types";
import { normalizeAirlineCode } from "@/lib/aircue/load-screenshot/contribute-auth";

export interface MatchCandidate {
  segmentKey: string;
  segment: OptionKeySegment;
}

export interface MatchResult {
  status: "matched" | "ambiguous" | "unmatched";
  segmentKey: string | null;
  matchConfidence: number;
  candidates: string[];
}

function normalizeFlightNumber(raw: string | null | undefined, airline?: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim().toUpperCase().replace(/\s+/g, "");
  const home = normalizeAirlineCode(airline);
  if (home && s.startsWith(home)) s = s.slice(home.length);
  s = s.replace(/^0+/, "") || "0";
  if (!/^\d{1,4}$/.test(s)) return null;
  return s;
}

function carrierOf(segment: OptionKeySegment): string {
  return normalizeAirlineCode(segment.carrier) ?? "";
}

function flightNumOf(segment: OptionKeySegment): string {
  return String(segment.flightNumber ?? "").replace(/\D/g, "").replace(/^0+/, "") || "0";
}

export function candidatesFromSegments(segments: OptionKeySegment[]): MatchCandidate[] {
  return segments.map((segment) => ({
    segmentKey: buildSegmentKey(segment),
    segment,
  }));
}

/**
 * Fuzzy-match an extraction to plan/board segments.
 * Prefer carrier+number+route; date/time refine confidence.
 */
export function matchExtractedToSegments(
  extracted: ExtractedFlightLoad,
  candidates: MatchCandidate[],
): MatchResult {
  const airline = normalizeAirlineCode(extracted.airline);
  const num = normalizeFlightNumber(extracted.flightNumber, airline);
  const origin = extracted.origin?.trim().toUpperCase() ?? null;
  const dest = extracted.dest?.trim().toUpperCase() ?? null;

  if (!airline || !num) {
    return { status: "unmatched", segmentKey: null, matchConfidence: 0, candidates: [] };
  }

  const scored = candidates
    .map((c) => {
      let score = 0;
      if (carrierOf(c.segment) !== airline) return null;
      if (flightNumOf(c.segment) !== num) return null;
      score += 0.55;
      if (origin && (c.segment.origin ?? "").toUpperCase() === origin) score += 0.2;
      if (dest && (c.segment.dest ?? "").toUpperCase() === dest) score += 0.2;
      if (extracted.depLocal && c.segment.depLocal) {
        const a = extracted.depLocal.replace(/\s/g, "").toLowerCase();
        const b = String(c.segment.depLocal).replace(/\s/g, "").toLowerCase();
        if (a && b && (a.includes(b.slice(0, 4)) || b.includes(a.slice(0, 4)))) score += 0.05;
      }
      return { key: c.segmentKey, score: Math.min(1, score) };
    })
    .filter((x): x is { key: string; score: number } => Boolean(x))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { status: "unmatched", segmentKey: null, matchConfidence: 0, candidates: [] };
  }
  if (scored.length > 1 && Math.abs(scored[0]!.score - scored[1]!.score) < 0.05) {
    return {
      status: "ambiguous",
      segmentKey: null,
      matchConfidence: scored[0]!.score,
      candidates: scored.map((s) => s.key),
    };
  }
  return {
    status: "matched",
    segmentKey: scored[0]!.key,
    matchConfidence: scored[0]!.score,
    candidates: scored.map((s) => s.key),
  };
}
