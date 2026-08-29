/** Flight data adapter. Free MVP uses AeroDataBox Basic when a key is present. */

import {
  aeroDataBoxEnabled,
  fetchDepartureBoard,
  fetchFlightLegs,
  fetchFlightStatus,
  type AdbFlight,
} from "@/lib/aircue/aerodatabox.server";
import { iataFromAirportName } from "@/lib/aircue/airport-lookup.server";
import { fidsCacheKey, preferredBoardWindow } from "@/lib/aircue/fids-cache-key";

export interface TripResolution {
  schedDepUtc: string;
  schedArrUtc: string;
  /** Scheduled departure in the origin airport's local time, "HH:MM". */
  depLocalTime?: string;
  originIata: string;
  destIata: string;
  airlineName?: string;
  rawStatusId?: string;
  /** Raw AeroDataBox status string when present. */
  status?: string;
  gate?: string | null;
  terminal?: string | null;
  revisedDepLocal?: string | null;
}

export interface FlightStatus {
  state: "scheduled" | "delayed" | "cancelled" | "departed" | "diverted";
  delayMinutes?: number;
  label: string;
}

/** Extra fields from number-status for Watch signal snapshots. */
export interface WatchStatusDetail {
  gate?: string | null;
  terminal?: string | null;
  schedDepLocal?: string | null;
  revisedDepLocal?: string | null;
  rawStatus?: string | null;
  fromCache?: boolean;
}

export interface InboundStatus {
  tail?: string;
  model?: string;
  inboundFrom?: string;
  estimatedArrival?: string;
  delayMinutes?: number;
}

export interface RouteCancelSummary {
  cancelledFlights: number;
  /** Earlier same-route departures running 15+ minutes behind. */
  delayedFlights: number;
  window: string;
  /** Cancelled flight numbers in the pressure window (for gating). */
  cancelledFlightNumbers?: string[];
  /** Canonical FIDS cache key for the exact board window used. */
  windowKey?: string;
}

export interface LegFilter {
  origin?: string | undefined;
  dest?: string | undefined;
}

export interface FlightProvider {
  readonly name: string;
  readonly live: boolean;
  resolve(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution | null>;
  /** Every leg the number flies that day, in schedule order. */
  resolveLegs(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution[]>;
  getStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    allowRefresh?: boolean,
    leg?: LegFilter,
  ): Promise<FlightStatus | null>;
  /** Fresh-enough status for watch rechecks; respects Watch TTL unless forceRefresh. */
  getWatchStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    leg?: LegFilter,
    opts?: { forceRefresh?: boolean },
  ): Promise<{
    status: FlightStatus | null;
    unavailable: boolean;
    detail?: WatchStatusDetail;
  }>;
  getInboundAircraft(
    flightNumber: string,
    travelDate: string,
    leg?: LegFilter,
  ): Promise<InboundStatus | null>;

  getEarlierRouteCancellations(
    origin: string,
    dest: string,
    travelDate: string,
    carrier: string,
    beforeLocalTime: string,
  ): Promise<RouteCancelSummary | null>;
}

/** No live flight data: the trip comes entirely from the traveller's form. */
export class ManualFlightProvider implements FlightProvider {
  readonly name = "manual";
  readonly live = false;
  async resolve() {
    return null;
  }
  async resolveLegs() {
    return [];
  }

  async getStatus() {
    return null;
  }
  async getWatchStatus() {
    return { status: null, unavailable: true };
  }
  async getInboundAircraft() {
    return null;
  }
  async getEarlierRouteCancellations() {
    return null;
  }
}

function minutesBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function toIso(raw: string): string {
  return new Date(raw.replace(" ", "T").replace("Z", "") + "Z").toISOString();
}

function localClock(raw?: string | null): string | null {
  if (!raw) return null;
  const slice = raw.includes("T") || raw.includes(" ") ? raw.slice(11, 16) : raw.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(slice) ? slice : null;
}

/** One AeroDataBox leg → a trip resolution, or null when key fields are missing. */
async function toResolution(flight: AdbFlight): Promise<TripResolution | null> {
  const dep = flight.departure?.scheduledTime?.utc;
  if (!dep) return null;
  const origin =
    flight.departure?.airport?.iata ??
    (await iataFromAirportName(
      flight.departure?.airport?.name,
      flight.departure?.airport?.icao,
    ));
  const dest =
    flight.arrival?.airport?.iata ??
    (await iataFromAirportName(flight.arrival?.airport?.name, flight.arrival?.airport?.icao));
  const arr = flight.arrival?.scheduledTime?.utc;
  if (!origin || !dest) return null;
  const depLocal = flight.departure?.scheduledTime?.local;
  return {
    originIata: origin,
    destIata: dest,
    schedDepUtc: toIso(dep),
    schedArrUtc: arr ? toIso(arr) : new Date(new Date(toIso(dep)).getTime() + 3 * 3600000).toISOString(),
    ...(depLocal ? { depLocalTime: depLocal.slice(11, 16) } : {}),
    ...(flight.airline?.name ? { airlineName: flight.airline.name } : {}),
    ...(flight.number ? { rawStatusId: flight.number } : {}),
    ...(flight.status ? { status: flight.status } : {}),
    gate: flight.departure?.gate ?? null,
    terminal: flight.departure?.terminal ?? null,
    revisedDepLocal: localClock(flight.departure?.revisedTime?.local),
  };
}

function toFlightStatus(flight: AdbFlight): FlightStatus {
  const raw = (flight.status ?? "").toLowerCase();
  const delay = minutesBetween(
    flight.departure?.scheduledTime?.utc,
    flight.departure?.revisedTime?.utc,
  );

  if (raw.includes("cancel")) return { state: "cancelled", label: "Cancelled" };
  if (raw.includes("divert")) return { state: "diverted", label: "Diverted" };
  if (raw.includes("depart") || raw.includes("en route") || raw.includes("arriv"))
    return {
      state: "departed",
      label: "Departed",
      ...(delay !== undefined ? { delayMinutes: delay } : {}),
    };
  if (delay !== undefined && delay >= 15)
    return { state: "delayed", delayMinutes: delay, label: `Delayed about ${delay} min` };
  return { state: "scheduled", label: "On schedule" };
}

function detailFromFlight(flight: AdbFlight, fromCache: boolean): WatchStatusDetail {
  return {
    gate: flight.departure?.gate ?? null,
    terminal: flight.departure?.terminal ?? null,
    schedDepLocal: localClock(flight.departure?.scheduledTime?.local),
    revisedDepLocal: localClock(flight.departure?.revisedTime?.local),
    rawStatus: flight.status ?? null,
    fromCache,
  };
}

/** AeroDataBox RapidAPI: status + FIDS with shared cache keys. */
export class AeroDataBoxFreeProvider implements FlightProvider {
  readonly name = "aerodatabox";
  readonly live = true;

  async resolve(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution | null> {
    const legs = await this.resolveLegs(flightNumber, travelDate, deviceId);
    return legs[0] ?? null;
  }

  async resolveLegs(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution[]> {
    const { flights } = await fetchFlightLegs(flightNumber, travelDate, {
      ...(deviceId ? { deviceId } : {}),
      watch: false,
    });
    const resolved = await Promise.all(flights.map((flight) => toResolution(flight)));
    return resolved
      .filter((r): r is TripResolution => r !== null)
      .sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  }

  async getStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    allowRefresh = false,
    leg?: LegFilter,
  ): Promise<FlightStatus | null> {
    const { flight } = await fetchFlightStatus(flightNumber, travelDate, {
      ...(tripId ? { tripId } : {}),
      force: allowRefresh,
      watch: false,
      origin: leg?.origin,
      dest: leg?.dest,
    });
    return flight ? toFlightStatus(flight) : null;
  }

  async getWatchStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    leg?: LegFilter,
    opts?: { forceRefresh?: boolean },
  ): Promise<{
    status: FlightStatus | null;
    unavailable: boolean;
    detail?: WatchStatusDetail;
  }> {
    const { flight, budgetBlocked, fromCache } = await fetchFlightStatus(flightNumber, travelDate, {
      ...(tripId ? { tripId } : {}),
      watch: true,
      force: opts?.forceRefresh === true,
      origin: leg?.origin,
      dest: leg?.dest,
    });
    if (!flight) {
      return { status: null, unavailable: true, detail: { fromCache } };
    }
    return {
      status: toFlightStatus(flight),
      unavailable: false,
      detail: detailFromFlight(flight, fromCache),
    };
  }

  /** Uses the includes on the cached status response — never a second call. */
  async getInboundAircraft(
    flightNumber: string,
    travelDate: string,
    leg?: LegFilter,
  ): Promise<InboundStatus | null> {
    const { flight } = await fetchFlightStatus(flightNumber, travelDate, {
      origin: leg?.origin,
      dest: leg?.dest,
      watch: true,
    });
    if (!flight?.aircraft?.reg && !flight?.aircraft?.model) return null;
    return {
      ...(flight.aircraft.reg ? { tail: flight.aircraft.reg } : {}),
      ...(flight.aircraft.model ? { model: flight.aircraft.model } : {}),
    };
  }

  async getEarlierRouteCancellations(
    origin: string,
    dest: string,
    travelDate: string,
    carrier: string,
    beforeLocalTime: string,
  ): Promise<RouteCancelSummary | null> {
    const window = preferredBoardWindow(travelDate, beforeLocalTime);
    const windowKey = fidsCacheKey(origin, travelDate, window.start, window.end);

    const { departures, budgetBlocked } = await fetchDepartureBoard(
      origin,
      travelDate,
      window.start,
      window.end,
    );
    if (budgetBlocked && departures.length === 0) return null;

    // Airport boards put the far endpoint under `movement`, not `arrival`.
    const relevant = departures.filter((f) => {
      const far = f.movement ?? f.arrival;
      const sameDest = far?.airport?.iata === dest;
      const sameCarrier = carrier === "ALL" || f.airline?.iata === carrier;
      const local = (f.departure?.scheduledTime?.local ?? far?.scheduledTime?.local ?? "").slice(
        11,
        16,
      );
      return sameDest && sameCarrier && Boolean(local) && local < beforeLocalTime;
    });

    const cancelled = relevant.filter((f) => (f.status ?? "").toLowerCase().includes("cancel"));

    const delayed = relevant.filter((f) => {
      if ((f.status ?? "").toLowerCase().includes("cancel")) return false;
      const mv = f.movement ?? f.departure;
      const slip = minutesBetween(mv?.scheduledTime?.utc, mv?.revisedTime?.utc);
      return (slip ?? 0) >= 15 || (f.status ?? "").toLowerCase().includes("delay");
    });

    const cancelledFlightNumbers = [
      ...new Set(
        cancelled
          .map((f) => (f.number ?? "").replace(/\s+/g, "").toUpperCase())
          .filter(Boolean),
      ),
    ].sort();

    return {
      cancelledFlights: cancelled.length,
      delayedFlights: delayed.length,
      window: "earlier today",
      cancelledFlightNumbers,
      windowKey,
    };
  }
}

export function getFlightProvider(): FlightProvider {
  return aeroDataBoxEnabled() ? new AeroDataBoxFreeProvider() : new ManualFlightProvider();
}
