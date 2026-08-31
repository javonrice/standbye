/**
 * Network snapshot — origin departure + destination arrival boards for one Plan day.
 * Feeds direct leg lookup and board-intersection strategy discovery without per-station FIDS fan-out.
 */
import { fetchArrivalBoard, fetchDepartureBoard } from "@/lib/aircue/aerodatabox.server";
import { iataFromAirportName } from "@/lib/aircue/airport-lookup.server";
import type { AdbFlight } from "@/lib/aircue/aerodatabox.server";
import { ALL_AIRLINES } from "@/lib/aircue/airlines";
import type { RouteLeg } from "@/lib/aircue/route-search.server";

export type StrategyDiscoveryStatus = "complete" | "partial" | "unavailable";

export interface StrategyDiscoveryMeta {
  status: StrategyDiscoveryStatus;
  checkedAt: string | null;
}

export interface NetworkSnapshot {
  originDepartures: Map<string, RouteLeg[]>;
  /** Legs X → dest keyed by destination airport (ORD, MDW, …). */
  destArrivals: Map<string, RouteLeg[]>;
  budgetBlocked: boolean;
  /** True when at least one expected board window failed or returned empty under stress. */
  boardsPartial: boolean;
  discovery: StrategyDiscoveryMeta;
}

const WINDOWS: Array<[string, string]> = [
  ["00:00", "11:59"],
  ["12:00", "23:59"],
];

function toIso(raw: string): string {
  return new Date(raw.replace(" ", "T").replace("Z", "") + "Z").toISOString();
}

async function legFromDepartureRow(flight: AdbFlight, boardOrigin: string): Promise<RouteLeg | null> {
  const depMovement = flight.departure ?? flight.movement;
  const arrMovement = flight.arrival ?? flight.movement;
  const dep = depMovement?.scheduledTime?.utc;
  if (!dep) return null;

  const origin = flight.departure?.airport
    ? (flight.departure.airport.iata ??
      (await iataFromAirportName(
        flight.departure.airport.name,
        flight.departure.airport.icao,
      )))
    : boardOrigin;
  const dest =
    arrMovement?.airport?.iata ??
    (await iataFromAirportName(arrMovement?.airport?.name, arrMovement?.airport?.icao));
  if (!origin || !dest) return null;

  const arr = flight.arrival?.scheduledTime?.utc;
  const arrLocal = flight.arrival?.scheduledTime?.local;
  const depLocal = depMovement?.scheduledTime?.local;
  const digits = (flight.number ?? "").replace(/\D/g, "");
  return {
    origin: origin.toUpperCase(),
    dest: dest.toUpperCase(),
    schedDepUtc: toIso(dep),
    schedArrUtc: arr
      ? toIso(arr)
      : new Date(new Date(toIso(dep)).getTime() + 3 * 3600000).toISOString(),
    ...(arr ? { arrUtcKnown: true } : {}),
    ...(arrLocal ? { arrLocalTime: arrLocal.slice(11, 16) } : {}),
    ...(depLocal ? { depLocalTime: depLocal.slice(11, 16) } : {}),
    ...(flight.airline?.name ? { airlineName: flight.airline.name } : {}),
    ...(flight.airline?.iata ? { airlineCode: flight.airline.iata.toUpperCase() } : {}),
    ...(digits ? { flightNumber: digits } : {}),
    ...(flight.status ? { status: flight.status } : {}),
  };
}

async function legFromArrivalRow(flight: AdbFlight, boardDest: string): Promise<RouteLeg | null> {
  const dep = flight.departure?.scheduledTime?.utc;
  const arr = flight.arrival?.scheduledTime?.utc;
  const origin = flight.departure?.airport
    ? (flight.departure.airport.iata ??
      (await iataFromAirportName(
        flight.departure.airport.name,
        flight.departure.airport.icao,
      )))
    : null;
  if (!dep || !arr || !origin) return null;

  const arrLocal = flight.arrival?.scheduledTime?.local;
  const depLocal = flight.departure?.scheduledTime?.local;
  const digits = (flight.number ?? "").replace(/\D/g, "");
  return {
    origin: origin.toUpperCase(),
    dest: boardDest.toUpperCase(),
    schedDepUtc: toIso(dep),
    schedArrUtc: toIso(arr),
    arrUtcKnown: true,
    ...(arrLocal ? { arrLocalTime: arrLocal.slice(11, 16) } : {}),
    ...(depLocal ? { depLocalTime: depLocal.slice(11, 16) } : {}),
    ...(flight.airline?.name ? { airlineName: flight.airline.name } : {}),
    ...(flight.airline?.iata ? { airlineCode: flight.airline.iata.toUpperCase() } : {}),
    ...(digits ? { flightNumber: digits } : {}),
    ...(flight.status ? { status: flight.status } : {}),
  };
}

export async function fetchNetworkSnapshot(input: {
  origins: string[];
  dests: string[];
  travelDate: string;
  airline: string;
  depTime?: string;
}): Promise<NetworkSnapshot> {
  const checkedAt = new Date().toISOString();
  const originDepartures = new Map<string, RouteLeg[]>();
  const destArrivals = new Map<string, RouteLeg[]>();
  let budgetBlocked = false;
  let boardsPartial = false;
  let anyData = false;

  const depWindows: Array<[string, string]> = input.depTime
    ? [[input.depTime, `${String(Math.min(23, Number(input.depTime.slice(0, 2)) + 11)).padStart(2, "0")}:59`]]
    : WINDOWS;

  for (const origin of input.origins) {
    const from = origin.toUpperCase();
    const boards = await Promise.all(
      depWindows.map(async ([start, end]) => {
        try {
          const board = await fetchDepartureBoard(
            from,
            input.travelDate,
            `${input.travelDate}T${start}`,
            `${input.travelDate}T${end}`,
          );
          return { ...board, ok: true };
        } catch {
          boardsPartial = true;
          return { departures: [], budgetBlocked: true, fromCache: false, ok: false };
        }
      }),
    );
    if (boards.every((b) => b.budgetBlocked)) budgetBlocked = true;
    if (boards.some((b) => !b.ok)) boardsPartial = true;

    const cutoff = Date.now() - 30 * 60 * 1000;
    const seen = new Set<string>();
    const legs: RouteLeg[] = [];
    for (const board of boards) {
      for (const flight of board.departures) {
        if (input.airline !== ALL_AIRLINES && flight.airline?.iata?.toUpperCase() !== input.airline)
          continue;
        const leg = await legFromDepartureRow(flight, from);
        if (!leg) continue;
        if (new Date(leg.schedDepUtc).getTime() < cutoff) continue;
        const key = `${leg.flightNumber ?? ""}-${leg.schedDepUtc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        legs.push(leg);
      }
    }
    if (legs.length > 0) anyData = true;
    legs.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
    originDepartures.set(from, legs);
  }

  for (const dest of input.dests) {
    const to = dest.toUpperCase();
    const boards = await Promise.all(
      WINDOWS.map(async ([start, end]) => {
        try {
          const board = await fetchArrivalBoard(
            to,
            input.travelDate,
            `${input.travelDate}T${start}`,
            `${input.travelDate}T${end}`,
          );
          return { ...board, ok: true };
        } catch {
          boardsPartial = true;
          return { arrivals: [], budgetBlocked: true, fromCache: false, ok: false };
        }
      }),
    );
    if (boards.every((b) => b.budgetBlocked)) budgetBlocked = true;
    if (boards.some((b) => !b.ok)) boardsPartial = true;

    const seen = new Set<string>();
    const legs: RouteLeg[] = [];
    for (const board of boards) {
      for (const flight of board.arrivals) {
        if (input.airline !== ALL_AIRLINES && flight.airline?.iata?.toUpperCase() !== input.airline)
          continue;
        const leg = await legFromArrivalRow(flight, to);
        if (!leg) continue;
        const key = `${leg.flightNumber ?? ""}-${leg.schedDepUtc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        legs.push(leg);
      }
    }
    if (legs.length > 0) anyData = true;
    legs.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
    destArrivals.set(to, legs);
  }

  let status: StrategyDiscoveryStatus = "complete";
  if (!anyData && budgetBlocked) status = "unavailable";
  else if (boardsPartial || budgetBlocked) status = "partial";

  return {
    originDepartures,
    destArrivals,
    budgetBlocked,
    boardsPartial,
    discovery: { status, checkedAt },
  };
}

/** Direct O→D legs from an already-fetched origin departure snapshot. */
export function routeLegsFromSnapshot(
  snapshot: NetworkSnapshot,
  origin: string,
  dest: string,
): RouteLeg[] {
  const legs = snapshot.originDepartures.get(origin.toUpperCase()) ?? [];
  return legs.filter((l) => l.dest.toUpperCase() === dest.toUpperCase());
}
