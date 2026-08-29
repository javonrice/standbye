/** Server-only reads for a single standby option. */
import type { SupabaseClient } from "@supabase/supabase-js";

import { optionFromRow, latestLoadFor } from "@/lib/aircue/plan.server";
import type { StandbyOption } from "@/lib/aircue/standby";

type Row = Record<string, unknown>;

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
  const { data } = await db
    .from("plan_options")
    .select("*, plans(travel_date,primary_option_id)")
    .eq("id", optionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    return { option: null, planId: null, travelDate: null, watchId: null, isPrimary: false };
  }
  const row = data as Row;
  const plan = (row["plans"] as Row) ?? {};
  const travelDate = String(plan["travel_date"] ?? "");
  const planId = String(row["plan_id"]);
  const load = await latestLoadFor(client, userId, String(row["flight_label"]), travelDate);

  const { data: watch } = await db
    .from("watch_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("state", "active")
    .maybeSingle();

  return {
    option: optionFromRow(row, load),
    planId,
    travelDate,
    watchId: watch ? String((watch as Row)["id"]) : null,
    isPrimary: String(plan["primary_option_id"] ?? "") === optionId,
  };
}
