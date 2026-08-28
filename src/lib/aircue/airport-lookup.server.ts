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

interface Geo {
  lat: number;
  lon: number;
  city: string | null;
}

const geoCache = new Map<string, Geo | null>();

/** Coordinates and city name for a set of IATA codes, from our airports table. */
export async function airportGeo(codes: string[]): Promise<Map<string, Geo>> {
  const wanted = [...new Set(codes.map((c) => c.toUpperCase()))];
  const missing = wanted.filter((c) => !geoCache.has(c));

  if (missing.length > 0) {
    const { data } = await supabaseAdmin
      .from("airports")
      .select("iata,lat,lon,city")
      .in("iata", missing);
    for (const row of (data ?? []) as Array<{
      iata: string;
      lat: number;
      lon: number;
      city: string | null;
    }>) {
      geoCache.set(row.iata.toUpperCase(), {
        lat: Number(row.lat),
        lon: Number(row.lon),
        city: row.city,
      });
    }
    for (const code of missing) if (!geoCache.has(code)) geoCache.set(code, null);
  }

  const out = new Map<string, Geo>();
  for (const code of wanted) {
    const hit = geoCache.get(code);
    if (hit) out.set(code, hit);
  }
  return out;
}

/** Great-circle distance in miles. */
export function milesBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(s));
}
