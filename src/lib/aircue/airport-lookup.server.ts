/**
 * AeroDataBox omits the IATA code on future-dated (schedule-only) legs and gives
 * just a city-ish airport name, e.g. { name: "Boston" }. Resolve those against
 * our own airports table so a Delta or Southwest flight three days out still
 * produces a usable route.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const cache = new Map<string, string | null>();

export async function iataFromAirportName(
  name: string | undefined,
  icao?: string | undefined,
): Promise<string | null> {
  const key = `${icao ?? ""}|${name ?? ""}`.toUpperCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  let found: string | null = null;

  if (icao) {
    const { data } = await supabaseAdmin
      .from("airports")
      .select("iata")
      .eq("icao", icao.toUpperCase())
      .maybeSingle();
    found = data?.iata ?? null;
  }

  if (!found && name) {
    const term = name.trim();
    const { data } = await supabaseAdmin
      .from("airports")
      .select("iata,city,name")
      .or(`city.ilike.${term},name.ilike.%${term}%`)
      .limit(2);
    // Only trust an unambiguous match — "New York" maps to three airports.
    if (data && data.length === 1) found = data[0]!.iata;
  }

  cache.set(key, found);
  return found;
}
