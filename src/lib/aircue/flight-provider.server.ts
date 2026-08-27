/** Flight data adapter. Free MVP uses AeroDataBox Basic when a key is present. */

import {
  aeroDataBoxEnabled,
  fetchDepartureBoard,
  fetchFlightStatus,
  type AdbFlight,
} from "@/lib/aircue/aerodatabox.server";

export interface TripResolution {
  schedDepUtc: string;
  schedArrUtc: string;
  originIata: string;
  destIata: string;
  airlineName?: string;
  rawStatusId?: string;
}

export interface FlightStatus {
  state: "scheduled" | "delayed" | "cancelled" | "departed" | "diverted";
  delayMinutes?: number;
  label: string;
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
  window: string;
}

export interface FlightProvider {
  readonly name: string;
  readonly live: boolean;
  resolve(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution | null>;
  getStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    allowRefresh?: boolean,
  ): Promise<FlightStatus | null>;
  getInboundAircraft(flightNumber: string, travelDate: string): Promise<InboundStatus | null>;
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
  async getStatus() {
    return null;
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

/** AeroDataBox RapidAPI Basic: one Tier-2 status call per flight per day, cached 24h. */
export class AeroDataBoxFreeProvider implements FlightProvider {
  readonly name = "aerodatabox";
  readonly live = true;

  async resolve(
    flightNumber: string,
    travelDate: string,
    deviceId?: string,
  ): Promise<TripResolution | null> {
    const { flight } = await fetchFlightStatus(flightNumber, travelDate, {
      ...(deviceId ? { deviceId } : {}),
    });
    const origin = flight?.departure?.airport?.iata;
    const dest = flight?.arrival?.airport?.iata;
    const dep = flight?.departure?.scheduledTime?.utc;
    const arr = flight?.arrival?.scheduledTime?.utc;
    if (!flight || !origin || !dest || !dep) return null;

    return {
      originIata: origin,
      destIata: dest,
      schedDepUtc: new Date(dep.replace(" ", "T").replace("Z", "") + "Z").toISOString(),
      schedArrUtc: arr
        ? new Date(arr.replace(" ", "T").replace("Z", "") + "Z").toISOString()
        : new Date(new Date(dep.replace(" ", "T").replace("Z", "") + "Z").getTime() + 3 * 3600000).toISOString(),
      ...(flight.airline?.name ? { airlineName: flight.airline.name } : {}),
      ...(flight.number ? { rawStatusId: flight.number } : {}),
    };
  }

  async getStatus(
    flightNumber: string,
    travelDate: string,
    tripId?: string,
    allowRefresh = false,
  ): Promise<FlightStatus | null> {
    const { flight } = await fetchFlightStatus(flightNumber, travelDate, {
      ...(tripId ? { tripId } : {}),
      force: allowRefresh,
    });
    return flight ? toFlightStatus(flight) : null;
  }

  /** Uses the includes on the cached status response — never a second call. */
  async getInboundAircraft(flightNumber: string, travelDate: string): Promise<InboundStatus | null> {
    const { flight } = await fetchFlightStatus(flightNumber, travelDate);
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
    const { departures, budgetBlocked } = await fetchDepartureBoard(
      origin,
      travelDate,
      `${travelDate}T00:00`,
      `${travelDate}T11:59`,
    );
    if (budgetBlocked && departures.length === 0) return null;

    const cancelled = departures.filter((f) => {
      const sameDest = f.arrival?.airport?.iata === dest;
      const sameCarrier = carrier === "ALL" || f.airline?.iata === carrier;
      const local = f.departure?.scheduledTime?.local ?? "";
      const earlier = local.slice(11, 16) < beforeLocalTime;
      return sameDest && sameCarrier && earlier && (f.status ?? "").toLowerCase().includes("cancel");
    });

    return { cancelledFlights: cancelled.length, window: "earlier today" };
  }
}

export function getFlightProvider(): FlightProvider {
  return aeroDataBoxEnabled() ? new AeroDataBoxFreeProvider() : new ManualFlightProvider();
}
