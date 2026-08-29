/** Deterministic flight presence for watch rechecks — no inference from ranking gaps. */

import type { FlightStatus } from "@/lib/aircue/flight-provider.server";
import type { StandbyOption } from "@/lib/aircue/standby";

export type WatchFlightState = "operating" | "cancelled" | "departed" | "unknown";

export type WatchSnapshot = {
  judgment: string;
  pillars: Record<string, string>;
  largestShowing: number | null;
  laterCount: number;
  flightState?: WatchFlightState;
};

export type FlightPresence =
  | { presence: "confirmed"; state: WatchFlightState; label: string }
  | { presence: "unavailable" };

/** Watched leg identity: flight number + date + origin + destination. */
export function watchFlightIdentity(
  option: StandbyOption,
): { flightNumber: string; origin: string; dest: string } | null {
  if (option.carrier && option.flightNumber) {
    return {
      flightNumber: `${option.carrier}${option.flightNumber}`,
      origin: option.origin,
      dest: option.dest,
    };
  }

  const seg = option.segments?.find((s) => s.carrier && s.flightNumber);
  if (seg) {
    return {
      flightNumber: `${seg.carrier}${seg.flightNumber}`,
      origin: seg.origin,
      dest: seg.dest,
    };
  }

  return null;
}

/** Map provider status into a watch-safe state. Delayed still means operating. */
export function classifyFlightStatus(status: FlightStatus): FlightPresence {
  switch (status.state) {
    case "cancelled":
      return { presence: "confirmed", state: "cancelled", label: status.label };
    case "departed":
    case "diverted":
      return { presence: "confirmed", state: "departed", label: status.label };
    case "scheduled":
    case "delayed":
      return { presence: "confirmed", state: "operating", label: status.label };
  }
}

/** Only the transition into cancelled produces an alert — not every recheck. */
export function shouldEmitCancellation(
  prev: WatchFlightState | undefined,
  next: WatchFlightState,
): boolean {
  return prev !== "cancelled" && next === "cancelled";
}

export function cancellationEvent(
  flightLabel: string,
  origin: string,
  dest: string,
): { kind: string; severity: string; headline: string; detail: string } {
  return {
    kind: "flight_cancelled",
    severity: "meaningful",
    headline: "Your flight was cancelled",
    detail: `${flightLabel} ${origin} → ${dest} is now showing cancelled.`,
  };
}
