/**
 * PlanStrategy — one unique ordered airport path discovered for a Plan.
 * Separates viable path discovery from deep option scoring/ranking.
 */
import type { GatewayOption, OptionSegment, StandbyOption } from "@/lib/aircue/standby";

/** Client-safe strategy row on StandbyPlan. */
export interface PlanStrategy {
  /** Deterministic identity: IAH>OKC>ORD */
  id: string;
  /** Full ordered airport path, e.g. ["IAH", "OKC", "ORD"]. */
  path: string[];
  optionIds: string[];
  optionCount: number;
  bestOptionId: string | null;
  bestRank: number | null;
  /**
   * Existing gateway discovery evidence for connection paths (path.length >= 3).
   * Null for direct paths.
   */
  gateway: GatewayOption | null;
}

/** Persisted in plans.prefs — option ids attached at load time. */
export interface StoredPlanStrategy {
  id: string;
  path: string[];
  gateway: GatewayOption | null;
  /** Stable discovery order when no scored option exists. Lower = earlier. */
  discoveryOrder: number;
}

export interface StrategyOptionRef {
  optionKey: string;
  rank: number;
  path: string[];
}

export interface ConnectionStrategySeed {
  path: string[];
  gateway: GatewayOption;
  discoveryOrder: number;
}

const norm = (code: string) => code.trim().toUpperCase();

/** Deterministic strategy id from ordered airport path. */
export function strategyIdFromPath(path: string[]): string {
  return path.map(norm).join(">");
}

/** Ordered airport path from scored/persisted option segments. */
export function airportPathFromSegments(segments: OptionSegment[]): string[] {
  if (segments.length === 0) return [];
  const path: string[] = [norm(segments[0]!.origin)];
  for (const seg of segments) {
    path.push(norm(seg.dest));
  }
  return path;
}

export function airportPathFromOptionLike(option: {
  kind: string;
  origin: string;
  dest: string;
  segments: OptionSegment[];
}): string[] {
  if (option.segments.length > 0) {
    return airportPathFromSegments(option.segments);
  }
  return [norm(option.origin), norm(option.dest)];
}

/** Actionable one-stop connection path from a verified gateway build. */
export function connectionPathFromLegs(input: {
  firstOrigin: string;
  via: string;
  finalDest: string;
}): string[] {
  return [norm(input.firstOrigin), norm(input.via), norm(input.finalDest)];
}

/**
 * Build the strategy catalog from discovery + ranked options (pre-persist).
 * Unscored connection paths from gateway discovery are included when evidence exists.
 */
export function buildStoredStrategies(input: {
  optionRefs: StrategyOptionRef[];
  connectionSeeds: ConnectionStrategySeed[];
}): StoredPlanStrategy[] {
  const map = new Map<string, StoredPlanStrategy>();

  for (const seed of input.connectionSeeds) {
    const path = seed.path.map(norm);
    const id = strategyIdFromPath(path);
    if (map.has(id)) continue;
    map.set(id, {
      id,
      path,
      gateway: seed.gateway,
      discoveryOrder: seed.discoveryOrder,
    });
  }

  for (const ref of input.optionRefs) {
    const path = ref.path.map(norm);
    const id = strategyIdFromPath(path);
    const existing = map.get(id);
    if (existing) continue;
    map.set(id, {
      id,
      path,
      gateway: null,
      discoveryOrder: 10_000 + ref.rank,
    });
  }

  return orderStoredStrategies([...map.values()], input.optionRefs);
}

function orderStoredStrategies(
  strategies: StoredPlanStrategy[],
  optionRefs: StrategyOptionRef[],
): StoredPlanStrategy[] {
  const bestRankById = new Map<string, number>();
  for (const ref of optionRefs) {
    const id = strategyIdFromPath(ref.path);
    const prev = bestRankById.get(id);
    if (prev === undefined || ref.rank < prev) bestRankById.set(id, ref.rank);
  }

  return strategies.sort((a, b) => {
    const ra = bestRankById.get(a.id);
    const rb = bestRankById.get(b.id);
    if (ra != null && rb != null) return ra - rb || a.discoveryOrder - b.discoveryOrder;
    if (ra != null) return -1;
    if (rb != null) return 1;
    return a.discoveryOrder - b.discoveryOrder || a.id.localeCompare(b.id);
  });
}

/** Attach persisted option ids and best rank from live plan options. */
export function attachOptionsToStrategies(
  stored: StoredPlanStrategy[],
  options: StandbyOption[],
): PlanStrategy[] {
  const byPath = new Map<string, StandbyOption[]>();
  for (const option of options) {
    const path = airportPathFromOptionLike(option);
    const id = strategyIdFromPath(path);
    const list = byPath.get(id) ?? [];
    list.push(option);
    byPath.set(id, list);
  }

  return stored.map((s) => {
    const matches = byPath.get(s.id) ?? [];
    matches.sort((a, b) => a.rank - b.rank);
    const best = matches[0] ?? null;
    return {
      id: s.id,
      path: s.path,
      optionIds: matches.map((o) => o.id),
      optionCount: matches.length,
      bestOptionId: best?.id ?? null,
      bestRank: best?.rank ?? null,
      gateway: s.gateway,
    };
  });
}

/** Legacy plans without prefs.strategies — group options; attach gateway by via station. */
export function strategiesFromLegacyPlan(
  options: StandbyOption[],
  gateways: GatewayOption[],
): PlanStrategy[] {
  const grouped = new Map<string, PlanStrategy>();
  for (const option of options) {
    const path = airportPathFromOptionLike(option);
    const id = strategyIdFromPath(path);
    const row = grouped.get(id) ?? {
      id,
      path,
      optionIds: [],
      optionCount: 0,
      bestOptionId: null,
      bestRank: null,
      gateway: null,
    };
    row.optionIds.push(option.id);
    row.optionCount = row.optionIds.length;
    if (row.bestRank === null || option.rank < row.bestRank) {
      row.bestRank = option.rank;
      row.bestOptionId = option.id;
    }
    grouped.set(id, row);
  }

  for (const g of gateways) {
    const via = norm(g.hub);
    const match = [...grouped.values()].find((s) => s.path.length === 3 && s.path[1] === via);
    if (match) match.gateway = g;
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.bestRank != null && b.bestRank != null) return a.bestRank - b.bestRank;
    if (a.bestRank != null) return -1;
    if (b.bestRank != null) return 1;
    return a.id.localeCompare(b.id);
  });
}

export function optionRefsFromRankedOptions(
  options: Array<{
    rank: number;
    optionKey: string;
    kind: string;
    origin: string;
    dest: string;
    segments: OptionSegment[];
  }>,
): StrategyOptionRef[] {
  return options.map((o) => ({
    optionKey: o.optionKey,
    rank: o.rank,
    path: airportPathFromOptionLike(o),
  }));
}

/** Verified gateway builds → connection strategy seeds (includes unscored paths). */
export function connectionSeedsFromGatewayBuilds(
  builds: Array<{
    hub: string;
    best: { first: { origin: string }; second: { dest: string } };
  }>,
  gateways: GatewayOption[],
): ConnectionStrategySeed[] {
  return builds.map((build, i) => ({
    path: connectionPathFromLegs({
      firstOrigin: build.best.first.origin,
      via: build.hub,
      finalDest: build.best.second.dest,
    }),
    gateway: gateways[i]!,
    discoveryOrder: i,
  }));
}

export function buildStrategyCatalog(input: {
  rankedOptions: Parameters<typeof optionRefsFromRankedOptions>[0];
  gatewayBuilds: Parameters<typeof connectionSeedsFromGatewayBuilds>[0];
  gateways: GatewayOption[];
}): StoredPlanStrategy[] {
  return buildStoredStrategies({
    optionRefs: optionRefsFromRankedOptions(input.rankedOptions),
    connectionSeeds: connectionSeedsFromGatewayBuilds(input.gatewayBuilds, input.gateways),
  });
}
