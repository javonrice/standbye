/**
 * Board-intersection connection discovery — all viable X from snapshot, no per-station FIDS.
 */
import { sameCity } from "@/lib/aircue/airport-groups";
import { airportGeo, milesBetween } from "@/lib/aircue/airport-lookup.server";
import { getFaaPrograms } from "@/lib/aircue/sources.server";
import type { NetworkSnapshot } from "@/lib/aircue/network-snapshot.server";
import type { RouteLeg } from "@/lib/aircue/route-search.server";
import type { GatewayOption, PillarState } from "@/lib/aircue/standby";

export const MIN_CONNECTION_LAYOVER_MIN = 60;
export const MAX_CONNECTION_LAYOVER_MIN = 6 * 60;
const MAX_DETOUR_BEST = 1.45;
const MAX_DETOUR_WIDE = 1.8;
const BACKTRACK_HINT = 1.22;

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
}): Promise<ConnectionGatewayBuild[]> {
  const destSet = new Set(input.dests.map((d) => d.toUpperCase()));
  const maxDetour = input.maxDetour ?? (input.wide ? MAX_DETOUR_WIDE : MAX_DETOUR_BEST);

  type InboundGroup = { origin: string; hub: string; legs: RouteLeg[]; ratio: number | null };
  const inboundGroups: InboundGroup[] = [];

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

    const geo = await airportGeo([origin, input.primaryDest, ...byHub.keys()]);
    const from = geo.get(origin.toUpperCase());
    const to = geo.get(input.primaryDest.toUpperCase());
    const direct = from && to ? milesBetween(from, to) : null;

    const ratioOf = (hub: string): number | null => {
      const h = geo.get(hub);
      if (!h || !from || !to || !direct || direct < 50) return null;
      return (milesBetween(from, h) + milesBetween(h, to)) / direct;
    };

    for (const [hub, hubLegs] of byHub) {
      const ratio = ratioOf(hub);
      if (ratio !== null && ratio > maxDetour) continue;
      inboundGroups.push({ origin, hub, legs: hubLegs, ratio });
    }
  }

  const onwardByHub = new Map<string, RouteLeg[]>();
  for (const [dest, legs] of input.snapshot.destArrivals) {
    for (const leg of legs) {
      if (input.allowed && leg.airlineCode && !input.allowed.has(leg.airlineCode)) continue;
      const hub = leg.origin.toUpperCase();
      if (destSet.has(hub) || sameCity(hub, input.primaryOrigin)) continue;
      const list = onwardByHub.get(hub) ?? [];
      list.push(leg);
      onwardByHub.set(hub, list);
    }
  }
  for (const list of onwardByHub.values()) {
    list.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  }

  const inboundHubs = new Set(inboundGroups.map((g) => g.hub));
  const intersecting = [...inboundHubs].filter((hub) => onwardByHub.has(hub));

  const faa = await getFaaPrograms();
  const builds: ConnectionGatewayBuild[] = [];

  for (const hub of intersecting.sort()) {
    if (input.outOfTime?.()) break;

    const groups = inboundGroups.filter((g) => g.hub === hub);
    const onward = onwardByHub.get(hub) ?? [];
    if (onward.length === 0) continue;

    let bestBuild: ConnectionGatewayBuild | null = null;

    for (const group of groups) {
      const { pairs, matchedInbound, usableOnward } = pairLegs(group.legs, onward, hub);
      if (pairs.length === 0) continue;
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

      let caveat: string | null = null;
      if (stopped) caveat = `Today's ${hub} operation is unstable.`;
      else if (delayed) caveat = `${hub} is running a delay program today.`;
      else if (group.ratio !== null && group.ratio >= BACKTRACK_HINT)
        caveat = "Plenty of onward options, but it means backtracking geographically.";

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
        caveat,
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

  return builds;
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
