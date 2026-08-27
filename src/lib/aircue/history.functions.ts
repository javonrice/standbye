import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { RouteHistory } from "@/lib/aircue/history";

export const getTripHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { tripId: string }) =>
    z.object({ tripId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<RouteHistory | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRouteHistory } = await import("@/lib/aircue/history.server");

    const { data: trip } = await supabaseAdmin
      .from("trips")
      .select("origin_iata,dest_iata,travel_date,sched_dep_utc,marketing_carrier")
      .eq("id", data.tripId)
      .maybeSingle();
    if (!trip) return null;

    let localHour: number | null = null;
    if (trip.sched_dep_utc) {
      const { data: airport } = await supabaseAdmin
        .from("airports")
        .select("tz")
        .eq("iata", trip.origin_iata)
        .maybeSingle();
      const tz = airport?.tz ?? "UTC";
      const hour = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).format(new Date(trip.sched_dep_utc));
      const parsed = Number(hour);
      if (Number.isFinite(parsed)) localHour = parsed % 24;
    }

    return getRouteHistory({
      origin: trip.origin_iata,
      dest: trip.dest_iata,
      travelDate: trip.travel_date,
      localHour,
      carrier: trip.marketing_carrier ?? "ALL",
    });
  });
