import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Brief } from "@/lib/aircue/data";

const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter airport code");

export interface AirportOption {
  iata: string;
  name: string;
  city: string | null;
  state: string | null;
}

export const searchAirports = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string }) => z.object({ q: z.string() }).parse(input))
  .handler(async ({ data }): Promise<AirportOption[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    let query = supabaseAdmin.from("airports").select("iata,name,city,state").limit(8);
    if (q) query = query.or(`iata.ilike.%${q}%,city.ilike.%${q}%,name.ilike.%${q}%`);
    const { data: rows } = await query.order("iata");
    return (rows ?? []) as AirportOption[];
  });

export interface FlightLeg {
  origin: string;
  dest: string;
  schedDepUtc: string;
  schedArrUtc: string;
  /** Departure in the origin airport's local time, "HH:MM". */
  depLocalTime?: string;

  airlineName?: string;
  /** Present when the leg came from a route search rather than a flight number. */
  airlineCode?: string;
  flightNumber?: string;
}


export interface ResolvedFlight {
  ok: boolean;
  reason?: "not_found" | "quota" | "error";
  /** Upcoming legs this number flies that day, earliest first. */
  legs?: FlightLeg[];
}

/** One Tier-2 AeroDataBox lookup, cached 24h, guarded by the daily and monthly caps. */
export const resolveFlight = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        airline: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{2,3}$/, "Pick an airline"),
        flightNumber: z
          .string()
          .trim()
          .regex(/^\d{1,4}$/, "Enter the flight number digits"),
        travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a travel date"),
        deviceId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ResolvedFlight> => {
    const { aeroDataBoxEnabled } = await import("@/lib/aircue/aerodatabox.server");
    if (!aeroDataBoxEnabled()) return { ok: false, reason: "quota" };

    const { AeroDataBoxFreeProvider } = await import("@/lib/aircue/flight-provider.server");
    try {
      const resolved = await new AeroDataBoxFreeProvider().resolveLegs(
        `${data.airline}${data.flightNumber}`,
        data.travelDate,
        data.deviceId,
      );
      // A standby brief for a leg that already left is useless — hide those.
      const cutoff = Date.now() - 30 * 60 * 1000;
      const upcoming = resolved.filter((l) => new Date(l.schedDepUtc).getTime() > cutoff);
      const legs = (upcoming.length > 0 ? upcoming : resolved).map((l) => ({
        origin: l.originIata,
        dest: l.destIata,
        schedDepUtc: l.schedDepUtc,
        schedArrUtc: l.schedArrUtc,
        ...(l.depLocalTime ? { depLocalTime: l.depLocalTime } : {}),
        ...(l.airlineName ? { airlineName: l.airlineName } : {}),

      }));
      if (legs.length === 0) return { ok: false, reason: "not_found" };
      return { ok: true, legs };
    } catch (error) {
      console.error("resolveFlight failed", error);
      return { ok: false, reason: "error" };
    }
  });


export const createBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tripName: z.string().trim().max(40, "Keep the trip name short").optional(),
        travelDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a travel date"),
        origin: iata,
        dest: iata,
        depTime: z.string().optional(),
        flightNumber: z
          .string()
          .trim()
          .regex(/^\d{1,4}$/)
          .optional(),
        schedDepUtc: z.string().optional(),
        schedArrUtc: z.string().optional(),
        airline: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9]{2,3}$/, "Pick an airline")
          .optional(),
        deviceId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ tripId: string }> => {
    const { ensureTrip, generateBrief } = await import("@/lib/aircue/pipeline.server");
    const live = Boolean(data.flightNumber && data.schedDepUtc);
    const defaultLabel =
      data.flightNumber && data.airline
        ? `${data.airline}${data.flightNumber}`
        : `${data.origin} → ${data.dest}`;

    const tripId = await ensureTrip({
      flightLabel: data.tripName?.trim() || defaultLabel,
      travelDate: data.travelDate,
      origin: data.origin,
      dest: data.dest,
      depTime: data.depTime || undefined,
      deviceId: data.deviceId,
      airline: data.airline || undefined,
      flightNumber: data.flightNumber || undefined,
      schedDepUtc: data.schedDepUtc || undefined,
      schedArrUtc: data.schedArrUtc || undefined,
      providerRef: live
        ? {
            provider: "aerodatabox",
            plan: "basic_free",
            last_status_at: new Date().toISOString(),
            raw_status_id: `${data.airline}${data.flightNumber}`,
            units_estimated: 2,
          }
        : undefined,
    });
    await generateBrief(tripId);
    return { tripId };
  });


export const getBrief = createServerFn({ method: "GET" })
  .inputValidator((input: { tripId: string }) =>
    z.object({ tripId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<Brief | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildBriefView, generateBrief } = await import("@/lib/aircue/pipeline.server");

    const { data: latest } = await supabaseAdmin
      .from("briefings")
      .select("generated_at")
      .eq("trip_id", data.tripId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const stale =
      !latest || Date.now() - new Date(latest.generated_at).getTime() > 10 * 60 * 1000;
    if (stale) {
      try {
        await generateBrief(data.tripId);
      } catch (error) {
        console.error("brief refresh failed", error);
      }
    }
    return buildBriefView(data.tripId);
  });

export const refreshBrief = createServerFn({ method: "POST" })
  .inputValidator((input: { tripId: string }) =>
    z.object({ tripId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<Brief | null> => {
    const { buildBriefView, generateBrief } = await import("@/lib/aircue/pipeline.server");
    await generateBrief(data.tripId);
    return buildBriefView(data.tripId);
  });

export const getSharedBrief = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }): Promise<Brief | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildBriefView } = await import("@/lib/aircue/pipeline.server");
    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("id")
      .eq("share_token", data.token)
      .maybeSingle();
    if (!trip) return null;
    return buildBriefView(trip.id);
  });

export const startWatch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        tripId: z.string().uuid(),
        email: z.string().email().optional(),
        deviceId: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("watches")
      .select("id")
      .eq("trip_id", data.tripId)
      .eq("device_id", data.deviceId)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("watches")
        .update({ state: "active", ended_at: null, email: data.email ?? null })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("watches").insert({
        trip_id: data.tripId,
        email: data.email ?? null,
        device_id: data.deviceId,
        state: "active",
        next_check_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await supabaseAdmin.from("change_events").insert({
        trip_id: data.tripId,
        change_type: "watch_started",
        headline: "Watch started.",
      });
    }
    return { ok: true };
  });


export const stopWatch = createServerFn({ method: "POST" })
  .inputValidator((input: { watchId: string }) =>
    z.object({ watchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("watches")
      .update({ state: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.watchId);
    return { ok: true };
  });

export interface WatchSummary {
  watchId: string;
  tripId: string;
  flightLabel: string;
  origin: string;
  destination: string;
  travelDate: string;
  state: string;
  status: string;
  headline: string;
  lastChange: string | null;
}

export const listWatches = createServerFn({ method: "GET" })
  .inputValidator((input: { deviceId: string }) =>
    z.object({ deviceId: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }): Promise<WatchSummary[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("watches")
      .select("id,state,trip_id,trips(flight_label,origin_iata,dest_iata,travel_date)")
      .eq("device_id", data.deviceId)
      .order("created_at", { ascending: false });

    const out: WatchSummary[] = [];
    for (const row of rows ?? []) {
      const trip = row.trips as unknown as {
        flight_label: string;
        origin_iata: string;
        dest_iata: string;
        travel_date: string;
      } | null;
      if (!trip) continue;
      const { data: briefing } = await supabaseAdmin
        .from("briefings")
        .select("status,headline")
        .eq("trip_id", row.trip_id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: change } = await supabaseAdmin
        .from("change_events")
        .select("headline")
        .eq("trip_id", row.trip_id)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      out.push({
        watchId: row.id,
        tripId: row.trip_id,
        flightLabel: trip.flight_label,
        origin: trip.origin_iata,
        destination: trip.dest_iata,
        travelDate: trip.travel_date,
        state: row.state,
        status:
          briefing?.status === "active_disruption"
            ? "disruption"
            : (briefing?.status ?? "incomplete"),
        headline: briefing?.headline ?? "No brief generated yet.",
        lastChange: change?.headline ?? null,
      });
    }
    return out;
  });
