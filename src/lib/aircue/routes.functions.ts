import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface RouteBoardRow {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  flightLabel: string;
  depLocal: string;
  arrLocal: string;
  bucket: "9+" | "1-8" | "0";
  largestN: number | null;
}

export interface RouteBoardResponse {
  ok: boolean;
  fromCache: boolean;
  elapsedMs: number;
  flights: RouteBoardRow[];
  reason?: "disabled" | "empty" | "error";
}

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter airport code");

/** Route day board: nonstops still selling in the public search, with AirCue buckets. */
export const searchRouteSellable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        origin: iata,
        dest: iata,
        travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a travel date"),
        airline: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{2,3}$/)
          .optional(),
        deviceId: z.string().optional(),
        mode: z.enum(["quick", "precise"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<RouteBoardResponse> => {
    const { buildRouteBoard } = await import("@/lib/aircue/serpapi-flights.server");
    const result = await buildRouteBoard({
      origin: data.origin,
      dest: data.dest,
      date: data.travelDate,
      carrier: data.airline && data.airline !== "ALL" ? data.airline : null,
      mode: data.mode ?? "quick",
      deviceId: data.deviceId ?? null,
    });
    return {
      ok: result.ok,
      fromCache: result.fromCache,
      elapsedMs: result.elapsedMs,
      flights: result.flights as RouteBoardRow[],
      ...(result.reason ? { reason: result.reason } : {}),
    };
  });
