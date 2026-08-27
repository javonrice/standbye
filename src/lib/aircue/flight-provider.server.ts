/** Phase 2 adapter seam. Free MVP ships ManualFlightProvider, which resolves nothing live. */

export interface TripResolution {
  schedDepUtc: string;
  schedArrUtc: string;
  originIata: string;
  destIata: string;
}

export interface FlightStatus {
  state: "scheduled" | "delayed" | "cancelled" | "departed";
  delayMinutes?: number;
}

export interface InboundStatus {
  tail?: string;
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
  resolve(flightLabel: string, travelDate: string): Promise<TripResolution | null>;
  getStatus(flightLabel: string, travelDate: string): Promise<FlightStatus | null>;
  getInboundAircraft(flightLabel: string, travelDate: string): Promise<InboundStatus | null>;
  getEarlierRouteCancellations(
    origin: string,
    dest: string,
    travelDate: string,
  ): Promise<RouteCancelSummary | null>;
}

/** Free MVP: the trip comes from the user's form, and no live flight data exists. */
export class ManualFlightProvider implements FlightProvider {
  readonly name = "manual";
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

export function getFlightProvider(): FlightProvider {
  // Phase 2: return new AeroDataBoxProvider() when the key is configured.
  return new ManualFlightProvider();
}
