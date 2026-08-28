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

const tzCache = new Map<string, string | null>();

/** IANA timezone for an airport, from our airports table. */
export async function airportTimezone(iata: string): Promise<string | null> {
  const code = iata.toUpperCase();
  if (tzCache.has(code)) return tzCache.get(code) ?? null;
  const { data } = await supabaseAdmin
    .from("airports")
    .select("tz")
    .eq("iata", code)
    .maybeSingle();
  const tz = (data as { tz?: string | null } | null)?.tz ?? null;
  tzCache.set(code, tz);
  return tz;
}

/**
 * A UTC instant rendered in an airport's local clock, e.g. "5:05 PM".
 * Returns "" when we cannot place the airport, because a wrong arrival time
 * is worse for a standby decision than no arrival time.
 */
export async function localClockAt(iata: string, utcIso: string): Promise<string> {
  const tz = await airportTimezone(iata);
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(utcIso));
  } catch {
    return "";
  }
}

const icaoCache = new Map<string, string | null>();

const ALASKA_TZ = new Set([
  "America/Anchorage",
  "America/Juneau",
  "America/Nome",
  "America/Sitka",
  "America/Yakutat",
  "America/Metlakatla",
  "America/Adak",
]);

const CONUS_TZ_PREFIXES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Detroit",
  "America/Boise",
  "America/Indiana/",
  "America/Kentucky/",
  "America/North_Dakota/",
  "America/Menominee",
];

/**
 * The real ICAO identifier for an airport, used for AWC weather lookups.
 * Prefers the stored code; otherwise derives the US prefix from state/timezone.
 * Returns null for anything we cannot place (Canada, Caribbean, Mexico, …) so
 * callers skip the request instead of sending a malformed id AWC rejects.
 */
export async function icaoForAirport(iata: string): Promise<string | null> {
  const code = iata.toUpperCase();
  if (icaoCache.has(code)) return icaoCache.get(code) ?? null;

  const { data } = await supabaseAdmin
    .from("airports")
    .select("icao,state,tz")
    .eq("iata", code)
    .maybeSingle();

  const row = data as { icao?: string | null; state?: string | null; tz?: string | null } | null;
  let icao: string | null = row?.icao?.trim() ? row.icao.trim().toUpperCase() : null;

  if (!icao && code.length === 3) {
    const state = row?.state?.toUpperCase() ?? null;
    const tz = row?.tz ?? "";
    if (state === "HI" || state === "AK" || tz === "Pacific/Honolulu" || ALASKA_TZ.has(tz)) {
      icao = `P${code}`;
    } else if (CONUS_TZ_PREFIXES.some((p) => (p.endsWith("/") ? tz.startsWith(p) : tz === p))) {
      icao = `K${code}`;
    }
  }

  icaoCache.set(code, icao);
  return icao;
}
