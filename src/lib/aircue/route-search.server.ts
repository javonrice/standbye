/**
 * Route-based flight lookup: "what leaves DEN for ORD that day".
 *
 * Uses the AeroDataBox departures board (Tier 2, cached 1h per airport/window)
 * so a traveller who does not know the flight number can still pick a real leg.
 */
import { fetchDepartureBoard, type AdbFlight } from "@/lib/aircue/aerodatabox.server";
import { ALL_AIRLINES } from "@/lib/aircue/airlines";

export interface RouteLeg {
  origin: string;
  dest: string;
  schedDepUtc: string;
  schedArrUtc: string;
  depLocalTime?: string;
  airlineName?: string;
  airlineCode?: string;
  flightNumber?: string;
}

/** AeroDataBox caps a board request at 12 hours, so a full day is two windows. */
const WINDOWS: Array<[string, string]> = [
  ["00:00", "11:59"],
  ["12:00", "23:59"],
];

function toIso(raw: string): string {
  return new Date(raw.replace(" ", "T").replace("Z", "") + "Z").toISOString();
}

function toRouteLeg(flight: AdbFlight): RouteLeg | null {
  const origin = flight.departure?.airport?.iata;
  const dest = flight.arrival?.airport?.iata;
  const dep = flight.departure?.scheduledTime?.utc;
  if (!origin || !dest || !dep) return null;
  const arr = flight.arrival?.scheduledTime?.utc;
  const depLocal = flight.departure?.scheduledTime?.local;
  const digits = (flight.number ?? "").replace(/\D/g, "");
  return {
    origin,
    dest,
    schedDepUtc: toIso(dep),
    schedArrUtc: arr
      ? toIso(arr)
      : new Date(new Date(toIso(dep)).getTime() + 3 * 3600000).toISOString(),
    ...(depLocal ? { depLocalTime: depLocal.slice(11, 16) } : {}),
    ...(flight.airline?.name ? { airlineName: flight.airline.name } : {}),
    ...(flight.airline?.iata ? { airlineCode: flight.airline.iata } : {}),
    ...(digits ? { flightNumber: digits } : {}),
  };
}

export async function findRouteLegs(
  origin: string,
  dest: string,
  travelDate: string,
  airline: string,
  depTime?: string,
): Promise<{ legs: RouteLeg[]; budgetBlocked: boolean }> {
  const from = origin.toUpperCase();
  const to = dest.toUpperCase();

  // A stated departure time narrows the day to one board call.
  const windows: Array<[string, string]> = depTime
    ? [[depTime, `${String(Math.min(23, Number(depTime.slice(0, 2)) + 11)).padStart(2, "0")}:59`]]
    : WINDOWS;

  const boards = await Promise.all(
    windows.map(([start, end]) =>
      fetchDepartureBoard(
        from,
        travelDate,
        `${travelDate}T${start}`,
        `${travelDate}T${end}`,
        `departures:${start}`,
      ),
    ),
  );

  const budgetBlocked = boards.every((b) => b.budgetBlocked);
  const cutoff = Date.now() - 30 * 60 * 1000;
  const seen = new Set<string>();
  const legs: RouteLeg[] = [];

  for (const board of boards) {
    for (const flight of board.departures) {
      if (flight.arrival?.airport?.iata?.toUpperCase() !== to) continue;
      if (airline !== ALL_AIRLINES && flight.airline?.iata?.toUpperCase() !== airline) continue;
      const leg = toRouteLeg(flight);
      if (!leg) continue;
      if (new Date(leg.schedDepUtc).getTime() < cutoff) continue;
      const key = `${leg.flightNumber ?? ""}-${leg.schedDepUtc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      legs.push(leg);
    }
  }

  legs.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  return { legs, budgetBlocked };
}
