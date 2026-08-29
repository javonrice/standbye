/**
 * Access-aware soft scoring adjustments (V2.1 §10).
 * Friction only — never a hard home > zed > other order.
 */
import type { AccessType } from "@/lib/aircue/travel-access";
import type { PillarState } from "@/lib/aircue/standby";

/** Modest friction: home < zed < other. */
export function accessFrictionPoints(access: AccessType | null | undefined): number {
  if (access === "home") return 0;
  if (access === "zed") return -6;
  if (access === "other") return -12;
  return -3;
}

/**
 * Clears-aware friction. standbyClears = segment count.
 * Generalizes the former flat connection −12 (two clears → −12).
 */
export function clearsFrictionPoints(standbyClears: number): number {
  const clears = Math.max(1, Math.floor(standbyClears));
  if (clears <= 1) return 0;
  return -(clears - 1) * 12;
}

/** Worst access across segments for itinerary-level friction. */
export function worstAccess(
  accesses: Array<AccessType | null | undefined>,
): AccessType | null {
  if (accesses.some((a) => a === "other")) return "other";
  if (accesses.some((a) => a === "zed")) return "zed";
  if (accesses.some((a) => a === "home")) return "home";
  return null;
}

/** Apply soft frictions to a pillar-derived base score (0–100). */
export function applyAccessAwareScore(
  baseScore: number,
  access: AccessType | null | undefined,
  standbyClears: number,
): number {
  const raw = baseScore + accessFrictionPoints(access) + clearsFrictionPoints(standbyClears);
  return Math.max(0, Math.min(100, raw));
}

/**
 * History load-factor bands. Higher threshold must win (≥0.93 before ≥0.87).
 */
export function classifyHistoryLoadFactor(lf: number | null): {
  state: PillarState;
  label: string;
  detailSuffix: "very_full" | "fuller" | "typical" | "unavailable";
} {
  if (lf === null) {
    return { state: "unknown", label: "Historical pattern unavailable", detailSuffix: "unavailable" };
  }
  if (lf >= 0.93) {
    return { state: "poor", label: "Very tight", detailSuffix: "very_full" };
  }
  if (lf >= 0.87) {
    return { state: "fair", label: "Tighter", detailSuffix: "fuller" };
  }
  return { state: "good", label: "Typical", detailSuffix: "typical" };
}
