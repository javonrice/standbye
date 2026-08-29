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

/**
 * Everything any caller needs about an airport, read in one batched query and
 * shared for the life of the process. Geo, timezone and the holiday lookup all
 * used to hit `airports` separately; they now share these rows.
 */
export interface AirportMeta {
  iata: string;
  icao: string | null;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  tz: string | null;
  country: string | null;
}

/** A code with no row is cached as null; a failed read is never cached. */
const metaCache = new Map<string, AirportMeta | null>();

/** Test-only: clear the process-wide metadata cache between suites. */
export function resetAirportMetaCacheForTests(): void {
  metaCache.clear();
}

/** Lightweight instrumentation: batched reads issued against `airports`. */
export const airportLookupStats = { metadataReads: 0, metadataRowsFetched: 0 };

interface AirportRow {
  iata: string;
  icao: string | null;
  lat: number;
  lon: number;
  city: string | null;
  state: string | null;
  tz: string | null;
  country: string | null;
}

/** Fill the cache for every code not already known. One query, not one per code. */
async function loadAirportMeta(codes: string[]): Promise<void> {
  const missing = [...new Set(codes.map((c) => c.toUpperCase()))].filter((c) => !metaCache.has(c));
  if (missing.length === 0) return;

  airportLookupStats.metadataReads += 1;
  const { data, error } = await supabaseAdmin
    .from("airports")
    .select("iata,icao,lat,lon,city,state,tz,country")
    .in("iata", missing);

  for (const row of ((data ?? []) as unknown as AirportRow[])) {
    airportLookupStats.metadataRowsFetched += 1;
    metaCache.set(row.iata.toUpperCase(), {
      iata: row.iata.toUpperCase(),
      icao: row.icao ?? null,
      lat: Number(row.lat),
      lon: Number(row.lon),
      city: row.city,
      state: row.state ?? null,
      tz: row.tz ?? null,
      country: row.country ?? null,
    });
  }
  // Only remember a miss when the read actually succeeded. Caching a failed
  // read as "unknown airport" would drop timezones for the process lifetime.
  if (error) return;
  for (const code of missing) if (!metaCache.has(code)) metaCache.set(code, null);
}


/** Full metadata for one airport, or null when we have no row for it. */
export async function airportMeta(iata: string): Promise<AirportMeta | null> {
  const code = iata.toUpperCase();
  await loadAirportMeta([code]);
  return metaCache.get(code) ?? null;
}

/** Coordinates and city name for a set of IATA codes, from our airports table. */
export async function airportGeo(codes: string[]): Promise<Map<string, Geo>> {
  const wanted = [...new Set(codes.map((c) => c.toUpperCase()))];
  await loadAirportMeta(wanted);

  const out = new Map<string, Geo>();
  for (const code of wanted) {
    const hit = metaCache.get(code);
    if (hit) out.set(code, { lat: hit.lat, lon: hit.lon, city: hit.city });
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

/** IANA timezone for an airport, from our airports table. */
export async function airportTimezone(iata: string): Promise<string | null> {
  return (await airportMeta(iata))?.tz ?? null;
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
  // icao, state and tz all come from the shared metadata row, so this costs
  // no query of its own once any caller has touched the airport.
  const row = await airportMeta(code);
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

  return icao;
}
