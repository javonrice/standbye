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
}> {
  const db = client as SupabaseClient;
  const { data } = await db
    .from("plan_options")
    .select("*, plans(travel_date)")
    .eq("id", optionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { option: null, planId: null, travelDate: null, watchId: null };
  const row = data as Row;
  const travelDate = String(((row["plans"] as Row) ?? {})["travel_date"] ?? "");
  const load = await latestLoadFor(client, userId, String(row["flight_label"]), travelDate);

  const { data: watch } = await db
    .from("watch_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_option_id", optionId)
    .eq("state", "active")
    .maybeSingle();

  return {
    option: optionFromRow(row, load),
    planId: String(row["plan_id"]),
    travelDate,
    watchId: watch ? String((watch as Row)["id"]) : null,
  };
}
