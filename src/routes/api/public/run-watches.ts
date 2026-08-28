import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/run-watches")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { recheckWatch } = await import("@/lib/aircue/plan.server");

        const now = new Date();
        const { data: due } = await supabaseAdmin
          .from("watch_plans")
          .select("id,user_id,plans(travel_date)")
          .eq("state", "active")
          .lte("next_check_at", now.toISOString())
          .limit(25);

        let checked = 0;
        let ended = 0;
        let changed = 0;

        for (const watch of due ?? []) {
          const plan = watch.plans as unknown as { travel_date: string | null } | null;
          const travelDate = plan?.travel_date ? new Date(`${plan.travel_date}T23:59:59Z`) : null;

          // The travel day is over: stop watching rather than burning API units.
          if (travelDate && travelDate.getTime() + 6 * 3600000 < now.getTime()) {
            await supabaseAdmin
              .from("watch_plans")
              .update({ state: "ended", ended_at: now.toISOString() })
              .eq("id", watch.id);
            ended += 1;
            continue;
          }

          try {
            const result = await recheckWatch(supabaseAdmin, watch.user_id, watch.id);
            if (result.changed) changed += 1;
            checked += 1;
          } catch (error) {
            console.error("watch refresh failed", watch.id, error);
            await supabaseAdmin
              .from("watch_plans")
              .update({
                last_checked_at: now.toISOString(),
                next_check_at: new Date(now.getTime() + 60 * 60000).toISOString(),
              })
              .eq("id", watch.id);
          }
        }

        return Response.json({ checked, changed, ended });
      },
    },
  },
});
