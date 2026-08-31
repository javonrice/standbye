/**
 * Board-intersection connection discovery — all viable X from snapshot, no per-station FIDS.
 */
import { sameCity } from "@/lib/aircue/airport-groups";
import { airportGeo, milesBetween } from "@/lib/aircue/airport-lookup.server";
import {
  evaluateConnectionViability,
  viabilityCaveatText,
  type ViabilityMode,
} from "@/lib/aircue/connection-viability.server";
import { getFaaPrograms } from "@/lib/aircue/sources.server";
import type { NetworkSnapshot } from "@/lib/aircue/network-snapshot.server";
import type { RouteLeg } from "@/lib/aircue/route-search.server";
import type { GatewayOption, PillarState } from "@/lib/aircue/standby";

export const MIN_CONNECTION_LAYOVER_MIN = 60;
export const MAX_CONNECTION_LAYOVER_MIN = 6 * 60;

export interface ConnectionCandidate {
  first: RouteLeg;
  second: RouteLeg;
  hub: string;
  layoverMinutes: number;
}

export interface ConnectionGatewayBuild {
  firstOrigin: string;
  hub: string;
  city: string | null;
  inbound: RouteLeg[];
  onward: RouteLeg[];
  best: ConnectionCandidate;
  addedMinutes: number | null;
  caveat: string | null;
  state: PillarState;
  label: string;
  summary: string;
  recoveryState: PillarState;
  recoveryLabel: string;
}

type InboundGroup = { origin: string; hub: string; legs: RouteLeg[]; ratio: number | null };

function pairLegs(
  inbound: RouteLeg[],
  onward: RouteLeg[],
  hub: string,
): { pairs: ConnectionCandidate[]; matchedInbound: RouteLeg[]; usableOnward: RouteLeg[] } {
  const pairs: ConnectionCandidate[] = [];
  const matchedInbound: RouteLeg[] = [];

  for (const first of inbound) {
    const arr = new Date(first.schedArrUtc).getTime();
    const second = onward.find((l) => {
      const gap = (new Date(l.schedDepUtc).getTime() - arr) / 60000;
      return gap >= MIN_CONNECTION_LAYOVER_MIN && gap <= MAX_CONNECTION_LAYOVER_MIN;
    });
    if (!second) continue;
    matchedInbound.push(first);
    pairs.push({
      first,
      second,
      hub,
      layoverMinutes: Math.round((new Date(second.schedDepUtc).getTime() - arr) / 60000),
    });
  }

  if (pairs.length === 0) {
    return { pairs: [], matchedInbound: [], usableOnward: [] };
  }

  pairs.sort((a, b) => a.first.schedDepUtc.localeCompare(b.first.schedDepUtc));
  matchedInbound.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  const best = pairs[0]!;
  const earliestArr = new Date(best.first.schedArrUtc).getTime();
  const usableOnward = onward.filter(
    (l) => (new Date(l.schedDepUtc).getTime() - earliestArr) / 60000 >= MIN_CONNECTION_LAYOVER_MIN,
  );

  return { pairs, matchedInbound, usableOnward };
}

function structuralInboundGroups(input: {
  snapshot: NetworkSnapshot;
  origins: string[];
  dests: string[];
  primaryDest: string;
  allowed: Set<string> | null;
}): InboundGroup[] {
  const destSet = new Set(input.dests.map((d) => d.toUpperCase()));
  const groups: InboundGroup[] = [];

  for (const [origin, legs] of input.snapshot.originDepartures) {
    const byHub = new Map<string, RouteLeg[]>();
    for (const leg of legs) {
      if (input.allowed && leg.airlineCode && !input.allowed.has(leg.airlineCode)) continue;
      const hub = leg.dest.toUpperCase();
      if (destSet.has(hub) || sameCity(hub, origin) || sameCity(hub, input.primaryDest)) continue;
      const list = byHub.get(hub) ?? [];
      list.push(leg);
      byHub.set(hub, list);
    }
    if (byHub.size === 0) continue;

    groups.push(
      ...[...byHub.entries()].map(([hub, hubLegs]) => ({
        origin,
        hub,
        legs: hubLegs,
        ratio: null as number | null,
      })),
    );
  }

  return groups;
}

function onwardByHub(input: {
  snapshot: NetworkSnapshot;
  dests: string[];
  primaryOrigin: string;
  allowed: Set<string> | null;
}): Map<string, RouteLeg[]> {
  const destSet = new Set(input.dests.map((d) => d.toUpperCase()));
  const map = new Map<string, RouteLeg[]>();

  for (const [, legs] of input.snapshot.destArrivals) {
    for (const leg of legs) {
      if (input.allowed && leg.airlineCode && !input.allowed.has(leg.airlineCode)) continue;
      const hub = leg.origin.toUpperCase();
      if (destSet.has(hub) || sameCity(hub, input.primaryOrigin)) continue;
      const list = map.get(hub) ?? [];
      list.push(leg);
      map.set(hub, list);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  }
  return map;
}

/**
 * Distinct X stations with ≥1 time-sequenceable A→X→B pair after structural/access filters,
 * BEFORE detour filtering.
 */
export function computeNetworkBreadth(input: {
  snapshot: NetworkSnapshot;
  origins: string[];
  dests: string[];
  primaryOrigin: string;
  primaryDest: string;
  allowed: Set<string> | null;
}): number {
  const inboundGroups = structuralInboundGroups(input);
  const onward = onwardByHub(input);
  const hubs = new Set<string>();

  for (const group of inboundGroups) {
    const hubLegs = onward.get(group.hub) ?? [];
    if (hubLegs.length === 0) continue;
    const { pairs } = pairLegs(group.legs, hubLegs, group.hub);
    if (pairs.length > 0) hubs.add(group.hub);
  }

  return hubs.size;
}

async function attachDetourRatios(
  groups: InboundGroup[],
  primaryDest: string,
): Promise<InboundGroup[]> {
  const hubs = [...new Set(groups.map((g) => g.hub))];
  const origins = [...new Set(groups.map((g) => g.origin))];
  const geo = await airportGeo([...origins, primaryDest, ...hubs]);

  return groups.map((group) => {
    const from = geo.get(group.origin.toUpperCase());
    const to = geo.get(primaryDest.toUpperCase());
    const h = geo.get(group.hub);
    if (!from || !to || !h) return group;
    const direct = milesBetween(from, to);
    if (direct < 50) return group;
    const ratio = (milesBetween(from, h) + milesBetween(h, to)) / direct;
    return { ...group, ratio };
  });
}

function mergeCaveats(...parts: Array<string | null | undefined>): string | null {
  return parts.filter(Boolean).join(" ") || null;
}

export async function discoverConnectionGatewaysFromSnapshot(input: {
  snapshot: NetworkSnapshot;
  origins: string[];
  dests: string[];
  primaryOrigin: string;
  primaryDest: string;
  allowed: Set<string> | null;
  wide: boolean;
  maxDetour?: number;
  outOfTime?: () => boolean;
}): Promise<{ builds: ConnectionGatewayBuild[]; networkBreadth: number }> {
  const mode: ViabilityMode = input.maxDetour != null && input.maxDetour >= 2 ? "escape" : input.wide ? "wide" : "normal";

  const networkBreadth = computeNetworkBreadth(input);
  let inboundGroups = structuralInboundGroups(input);
  inboundGroups = await attachDetourRatios(inboundGroups, input.primaryDest);

  const onwardMap = onwardByHub(input);
  const inboundHubs = new Set(inboundGroups.map((g) => g.hub));
  const intersecting = [...inboundHubs].filter((hub) => onwardMap.has(hub));

  const faa = await getFaaPrograms();
  const builds: ConnectionGatewayBuild[] = [];

  for (const hub of intersecting.sort()) {
    if (input.outOfTime?.()) break;

    const groups = inboundGroups.filter((g) => g.hub === hub);
    const onward = onwardMap.get(hub) ?? [];
    if (onward.length === 0) continue;

    let bestBuild: ConnectionGatewayBuild | null = null;

    for (const group of groups) {
      const { pairs, matchedInbound, usableOnward } = pairLegs(group.legs, onward, hub);
      if (pairs.length === 0) continue;

      const viability = evaluateConnectionViability({
        origin: group.origin,
        via: hub,
        destination: input.primaryDest,
        mode: input.maxDetour != null ? "escape" : mode,
        networkBreadth,
        detourRatio: group.ratio,
      });
      if (!viability.eligible) continue;

      const best = pairs[0]!;
      const programs = (faa.data ?? []).filter((p) => p.airport === hub);
      const stopped = programs.some((p) => p.type === "ground_stop" || p.type === "closure");
      const delayed = programs.some((p) => p.type === "ground_delay" || p.type === "delay");

      let state: PillarState = "fair";
      let label = "Possible";
      if (stopped) {
        state = "poor";
        label = "Weak today";
      } else if (matchedInbound.length >= 3 && usableOnward.length >= 4 && !delayed) {
        state = "good";
        label = "Strong alternate";
      } else if (matchedInbound.length >= 2 && usableOnward.length >= 2) {
        label = "Good alternative";
      }

      const geo = await airportGeo([group.origin, input.primaryDest, hub]);
      const from = geo.get(group.origin);
      const to = geo.get(input.primaryDest.toUpperCase());
      const h = geo.get(hub);
      const direct = from && to ? milesBetween(from, to) : null;
      const addedMinutes =
        direct !== null && group.ratio !== null
          ? Math.round((group.ratio - 1) * (direct / 480) * 60)
          : null;

      const build: ConnectionGatewayBuild = {
        firstOrigin: group.origin,
        hub,
        city: h?.city ?? null,
        inbound: matchedInbound.slice(0, 6),
        onward: usableOnward,
        best,
        addedMinutes,
        caveat: mergeCaveats(
          stopped ? `Today's ${hub} operation is unstable.` : null,
          delayed ? `${hub} is running a delay program today.` : null,
          viabilityCaveatText(viability.caveat),
        ),
        state,
        label,
        summary: `${matchedInbound.length} realistic shot${matchedInbound.length === 1 ? "" : "s"} into ${h?.city ?? hub}, ${usableOnward.length} useful flight${usableOnward.length === 1 ? "" : "s"} onward to ${input.primaryDest}.`,
        recoveryState: usableOnward.length >= 4 ? "good" : usableOnward.length >= 2 ? "fair" : "poor",
        recoveryLabel:
          usableOnward.length >= 4 ? "Excellent" : usableOnward.length >= 2 ? "Good" : "Thin",
      };

      if (
        !bestBuild ||
        (["good", "fair", "unknown", "poor"].indexOf(build.state) <
          ["good", "fair", "unknown", "poor"].indexOf(bestBuild.state) &&
          build.onward.length >= bestBuild.onward.length)
      ) {
        bestBuild = build;
      }
    }

    if (bestBuild) builds.push(bestBuild);
  }

  const order: PillarState[] = ["good", "fair", "unknown", "poor"];
  builds.sort(
    (a, b) =>
      order.indexOf(a.state) - order.indexOf(b.state) ||
      b.onward.length - a.onward.length ||
      b.inbound.length - a.inbound.length,
  );

  return { builds, networkBreadth };
}

/** Map internal build to legacy GatewayOption (server-side evidence). */
export function gatewayOptionFromBuild(
  build: ConnectionGatewayBuild,
  inboundShots: GatewayOption["inboundShots"],
  onwardDepartures: string[],
): GatewayOption {
  return {
    hub: build.hub,
    city: build.city,
    state: build.state,
    label: build.label,
    summary: build.summary,
    inboundShots,
    onwardDepartures,
    onwardCount: build.onward.length,
    recoveryState: build.recoveryState,
    recoveryLabel: build.recoveryLabel,
    caveat: build.caveat,
    addedMinutes: build.addedMinutes,
  };
}

export function connectionEvidenceFromBuild(build: ConnectionGatewayBuild) {
  return {
    via: build.hub,
    inboundCount: build.inbound.length,
    onwardCount: build.onward.length,
    summary: build.summary,
  };
}
