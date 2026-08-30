/** Server-only reads for a single standby option. */
import type { SupabaseClient } from "@supabase/supabase-js";

import { optionFromRow, loadsForOptionRow } from "@/lib/aircue/plan.server";
import type { StandbyOption } from "@/lib/aircue/standby";

type Row = Record<string, unknown>;

/**
 * Parent plan embed must name the FK explicitly: after
 * `plans.primary_option_id → plan_options.id`, PostgREST sees two
 * relationships between these tables. We always want the owning plan via
 * `plan_options.plan_id → plans.id` (`plan_options_plan_id_fkey`).
 */
const PLAN_EMBED =
  "plans!plan_options_plan_id_fkey(travel_date,travelers,primary_option_id)";

export async function loadOption(
  client: unknown,
  userId: string,
  optionId: string,
): Promise<{
  option: StandbyOption | null;
  planId: string | null;
  travelDate: string | null;
  watchId: string | null;
  isPrimary: boolean;
}> {
  const db = client as SupabaseClient;
  const { data, error } = await db
    .from("plan_options")
    .select(`*, ${PLAN_EMBED}`)
    .eq("id", optionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[loadOption] plan_options query failed", {
      optionId,
      userId,
      message: error.message,
      code: error.code,
      details: error.details,
    });
    throw new Error(`Could not load this option right now: ${error.message}`);
  }

  if (!data) {
    return { option: null, planId: null, travelDate: null, watchId: null, isPrimary: false };
  }
  const row = data as Row;
  const plan = (row["plans"] as Row) ?? {};
  const travelDate = String(plan["travel_date"] ?? "");
  const planId = String(row["plan_id"]);
  const partySize = Number(plan["travelers"] ?? 1);
  const loads = await loadsForOptionRow(client, userId, row, travelDate);

  const { data: watch, error: watchError } = await db
    .from("watch_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("state", "active")
    .maybeSingle();

  if (watchError) {
    console.error("[loadOption] watch_plans query failed", {
      optionId,
      planId,
      message: watchError.message,
      code: watchError.code,
    });
    // Option itself loaded — watch badge is secondary; fail soft without wiping the option.
  }

  return {
    option: optionFromRow(row, { loadsBySegment: loads, partySize }),
    planId,
    travelDate,
    watchId: watch ? String((watch as Row)["id"]) : null,
    isPrimary: String(plan["primary_option_id"] ?? "") === optionId,
  };
}
