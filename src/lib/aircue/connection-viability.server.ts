/**
 * Shared connection viability — one policy for Strategy discovery and Option admission.
 */
import { airportGeo, milesBetween } from "@/lib/aircue/airport-lookup.server";

/** Distinct X count below this → thin network (2.0 detour ceiling in normal mode). */
export const THIN_NETWORK_THRESHOLD = 5;

export const DETOUR_CEILING_BROAD = 1.45;
export const DETOUR_CEILING_THIN = 2.0;
export const DETOUR_CEILING_WIDE_BROAD = 1.8;
export const DETOUR_CEILING_ESCAPE = 2.0;
export const BACKTRACK_HINT = 1.22;

export type ViabilityMode = "normal" | "wide" | "escape" | "expert";

export type ViabilityCaveat = "none" | "backtracking" | "strong_backtrack";

export interface ConnectionViabilityInput {
  origin: string;
  via: string;
  destination: string;
  mode: ViabilityMode;
  /** Pre-detour count of distinct X with ≥1 sequenceable A→X→B pair. */
  networkBreadth: number;
  detourRatio: number | null;
}

export interface ConnectionViabilityResult {
  eligible: boolean;
  detourCeiling: number;
  caveat: ViabilityCaveat;
  reason?: string;
}

export function detourCeilingForNetwork(input: {
  mode: ViabilityMode;
  networkBreadth: number;
}): number {
  if (input.mode === "expert") return Number.POSITIVE_INFINITY;
  if (input.mode === "escape") return DETOUR_CEILING_ESCAPE;
  const thin = input.networkBreadth < THIN_NETWORK_THRESHOLD;
  if (input.mode === "wide") {
    return thin ? DETOUR_CEILING_THIN : DETOUR_CEILING_WIDE_BROAD;
  }
  return thin ? DETOUR_CEILING_THIN : DETOUR_CEILING_BROAD;
}

export function caveatFromDetourRatio(
  detourRatio: number | null,
  networkBreadth: number,
): ViabilityCaveat {
  if (detourRatio === null || detourRatio < BACKTRACK_HINT) return "none";
  const thin = networkBreadth < THIN_NETWORK_THRESHOLD;
  return thin ? "strong_backtrack" : "backtracking";
}

export function viabilityCaveatText(caveat: ViabilityCaveat): string | null {
  if (caveat === "strong_backtrack") {
    return "Plenty of onward options, but it means backtracking geographically.";
  }
  if (caveat === "backtracking") {
    return "This routing backtracks geographically compared to flying direct.";
  }
  return null;
}

export function evaluateConnectionViability(
  input: ConnectionViabilityInput,
): ConnectionViabilityResult {
  const detourCeiling = detourCeilingForNetwork({
    mode: input.mode,
    networkBreadth: input.networkBreadth,
  });

  if (input.mode !== "expert" && input.detourRatio !== null && input.detourRatio > detourCeiling) {
    return {
      eligible: false,
      detourCeiling,
      caveat: "none",
      reason: `Detour ratio ${input.detourRatio.toFixed(2)} exceeds ceiling ${detourCeiling}`,
    };
  }

  return {
    eligible: true,
    detourCeiling,
    caveat: caveatFromDetourRatio(input.detourRatio, input.networkBreadth),
  };
}

/** Great-circle detour ratio for O→X→D; null when geo unavailable. */
export async function detourRatioForPath(
  origin: string,
  via: string,
  destination: string,
): Promise<number | null> {
  const geo = await airportGeo([origin, via, destination]);
  const from = geo.get(origin.toUpperCase());
  const to = geo.get(destination.toUpperCase());
  const h = geo.get(via.toUpperCase());
  if (!from || !to || !h) return null;
  const direct = milesBetween(from, to);
  if (direct < 50) return null;
  return (milesBetween(from, h) + milesBetween(h, to)) / direct;
}
