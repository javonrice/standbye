import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Adaptive cadence: closer to departure means more frequent rechecks. */
function nextCheckDelayMs(schedDep: Date, now: Date): number {
  const hours = (schedDep.getTime() - now.getTime()) / 3600000;
  if (hours > 168) return 24 * 3600000;
  if (hours > 72) return 12 * 3600000;
  if (hours > 24) return 4 * 3600000;
  return 45 * 60000;
}

export const Route = createFileRoute("/api/public/run-watches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;


        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateBrief } = await import("@/lib/aircue/pipeline.server");

        const now = new Date();
        const { data: due } = await supabaseAdmin
          .from("watches")
          .select("id,trip_id,trips(sched_dep_utc,arr_window_end)")
          .eq("state", "active")
          .lte("next_check_at", now.toISOString())
          .limit(25);

        let checked = 0;
        let ended = 0;

        for (const watch of due ?? []) {
          const trip = watch.trips as unknown as {
            sched_dep_utc: string | null;
            arr_window_end: string | null;
          } | null;
          const arrEnd = trip?.arr_window_end ? new Date(trip.arr_window_end) : null;

          if (arrEnd && arrEnd.getTime() + 3 * 3600000 < now.getTime()) {
            await supabaseAdmin
              .from("watches")
              .update({ state: "ended", ended_at: now.toISOString() })
              .eq("id", watch.id);
            ended += 1;
            continue;
          }

          try {
            await generateBrief(watch.trip_id);
            checked += 1;
          } catch (error) {
            console.error("watch refresh failed", watch.id, error);
          }

          const schedDep = trip?.sched_dep_utc ? new Date(trip.sched_dep_utc) : now;
          await supabaseAdmin
            .from("watches")
            .update({
              last_checked_at: now.toISOString(),
              next_check_at: new Date(
                now.getTime() + nextCheckDelayMs(schedDep, now),
              ).toISOString(),
            })
            .eq("id", watch.id);
        }

        return Response.json({ checked, ended });
      },
    },
  },
});
