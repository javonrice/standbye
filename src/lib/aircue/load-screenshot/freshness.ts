/**
 * Load snapshot freshness for UI + smart-refresh gates.
 * See docs/shared-load-snapshots-architecture.md §6–8.
 */

export type LoadFreshnessBand = "very_fresh" | "fresh" | "aging" | "stale";

export function evaluateLoadFreshness(input: {
  observedAtIso: string;
  schedDepUtc?: string | null;
  nowMs?: number;
}): { band: LoadFreshnessBand; ageHours: number; hoursToDep: number | null } {
  const now = input.nowMs ?? Date.now();
  const observed = Date.parse(input.observedAtIso);
  const ageHours = Number.isFinite(observed) ? Math.max(0, (now - observed) / 3_600_000) : 99;
  const dep = input.schedDepUtc ? Date.parse(input.schedDepUtc) : NaN;
  const hoursToDep = Number.isFinite(dep) ? (dep - now) / 3_600_000 : null;

  let band: LoadFreshnessBand =
    ageHours <= 0.5 ? "very_fresh" : ageHours <= 2 ? "fresh" : ageHours <= 6 ? "aging" : "stale";

  if (hoursToDep != null && hoursToDep <= 3 && ageHours > 1) band = "stale";
  else if (hoursToDep != null && hoursToDep <= 6 && ageHours > 3 && band !== "stale") band = "aging";
  else if (hoursToDep != null && hoursToDep >= 48 && ageHours <= 12 && band === "stale") band = "aging";

  return { band, ageHours, hoursToDep };
}

export function freshnessLabel(band: LoadFreshnessBand, ageHours: number): string {
  if (band === "very_fresh") {
    if (ageHours < 1 / 60) return "Updated just now";
    if (ageHours < 1) return `Updated ${Math.max(1, Math.round(ageHours * 60))}m ago`;
    return "Updated recently";
  }
  if (band === "fresh") {
    if (ageHours < 1) return `Updated ${Math.max(1, Math.round(ageHours * 60))}m ago`;
    return `Updated ${ageHours.toFixed(ageHours < 10 ? 1 : 0)}h ago`;
  }
  if (band === "aging") return "Load may be stale";
  return "Refresh recommended";
}

/**
 * Smart-refresh v1: prompt only when the user can contribute that airline
 * and the load used on the plan looks stale / near-dep aging.
 */
export function shouldPromptLoadRefresh(input: {
  watchingOrPlanDetail: boolean;
  usedLoadSnapshot: boolean;
  freshness: LoadFreshnessBand;
  hoursToDep: number | null;
  ageHours: number;
  userHomeAirline: string | null | undefined;
  snapshotAirline: string | null | undefined;
}): boolean {
  if (!input.watchingOrPlanDetail || !input.usedLoadSnapshot) return false;
  const home = (input.userHomeAirline ?? "").trim().toUpperCase();
  const air = (input.snapshotAirline ?? "").trim().toUpperCase();
  if (!home || !air || home !== air) return false;

  if (input.freshness === "stale") return true;
  if (
    input.hoursToDep != null &&
    input.hoursToDep <= 3 &&
    input.ageHours > 0.5
  ) {
    return true;
  }
  return false;
}
