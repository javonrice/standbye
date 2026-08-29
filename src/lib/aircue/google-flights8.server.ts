/**
 * Sellable-inventory route board via RapidAPI "google-flights8".
 *
 * Same party-size trick as before: one search at adults=9 (still sellable to a
 * big party = loose) and one at adults=1 (everything publicly sellable at all).
 * Precise mode steps shared party levels down to pin the largest party size.
 *
 * Server-only: reads GOOGLE_FLIGHTS8_RAPIDAPI_KEY, writes source_cache and
 * serpapi_usage_log (kept as the shared provider usage table).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_TTL_MIN = 120;
const NEAR_DEP_TTL_MIN = 60;
/**
 * The provider stops returning real carrier itineraries above a party of 4 —
 * it falls back to a couple of long connections regardless of true inventory.
 * So 4 is our "still selling freely" ceiling, not 9.
 */
const CEILING_PARTY = 4;
const STEPDOWN = [3, 2, 1] as const;
const API_HOST = "google-flights8.p.rapidapi.com";

export type SellableBucket = "9+" | "1-8" | "0";

export interface RouteBoardFlight {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  flightLabel: string;
  depLocal: string;
  arrLocal: string;
  bucket: SellableBucket;
  largestN: number | null;
}

export interface RouteBoardResult {
  ok: boolean;
  fromCache: boolean;
  elapsedMs: number;
  flights: RouteBoardFlight[];
  reason?: "disabled" | "empty" | "error";
}

interface Gf8Segment {
  from?: string;
  to?: string;
  departure?: string;
  airline?: string;
  flight_number?: string;
}

interface Gf8Flight {
  name?: string;
  departure?: string;
  arrival?: string;
  stops?: string;
  price?: string | number;
  segments?: Gf8Segment[];
}

interface Gf8Response {
  success?: boolean;
  flights?: Gf8Flight[];
}

interface BoardCachePayload {
  flights: RouteBoardFlight[];
  builtAt: string;
}

export function googleFlights8Enabled(): boolean {
  const flag = process.env["GOOGLE_FLIGHTS8_ENABLED"];
  if (flag && flag.toLowerCase() === "false") return false;
  return Boolean(process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"]);
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function to12h(raw: string | undefined): string {
  if (!raw) return "";
  const time = raw.length > 5 ? raw.slice(11, 16) : raw;
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, m] = time.split(":").map(Number);
  const hour = h ?? 0;
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/* -------------------------------- caching -------------------------------- */

async function readCache<T>(key: string): Promise<{ data: T; fresh: boolean } | null> {
  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!row) return null;
  return { data: row.payload as T, fresh: new Date(row.expires_at).getTime() > Date.now() };
}

async function writeCache(key: string, payload: unknown, ttlMinutes: number): Promise<void> {
  const now = Date.now();
  await supabaseAdmin.from("source_cache").upsert({
    cache_key: key,
    payload: payload as never,
    fetched_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMinutes * 60 * 1000).toISOString(),
  });
}

/* --------------------------------- fetch --------------------------------- */

async function routeSearchCached(params: {
  origin: string;
  dest: string;
  date: string;
  adults: number;
  ttlMinutes: number;
}): Promise<Gf8Response> {
  const key = `gf8:routeN:${params.origin}:${params.dest}:${params.date}:${params.adults}`;
  const cached = await readCache<Gf8Response>(key);
  if (cached?.fresh) return cached.data;

  const apiKey = process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"];
  if (!apiKey) throw new Error("GOOGLE_FLIGHTS8_RAPIDAPI_KEY is not configured");
  const qs = new URLSearchParams({
    origin: params.origin,
    destination: params.dest,
    date: params.date,
    trip_type: "one-way",
    adults: String(params.adults),
    currency: "USD",
  });
  const res = await fetch(`https://${API_HOST}/api/v1/search?${qs}`, {
    headers: { "x-rapidapi-host": API_HOST, "x-rapidapi-key": apiKey },
  });
  if (!res.ok) throw new Error(`google-flights8 responded ${res.status}`);
  const body = (await res.json()) as Gf8Response;
  await writeCache(key, body, params.ttlMinutes);
  return body;
}

interface Nonstop {
  code: string;
  digits: string;
  label: string;
  airlineName: string;
  depLocal: string;
  arrLocal: string;
}

/** Priced nonstop single-segment itineraries, keyed by normalized flight number. */
function nonstopsFrom(body: Gf8Response, carrier: string | null): Map<string, Nonstop> {
  const out = new Map<string, Nonstop>();
  for (const f of body.flights ?? []) {
    const segments = f.segments ?? [];
    if (segments.length !== 1) continue;
    const seg = segments[0]!;
    const code = (seg.airline ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const digits = String(seg.flight_number ?? "").replace(/[^0-9]/g, "");
    if (!code || !digits) continue;
    if (carrier && code !== carrier.toUpperCase()) continue;
    if (f.price === undefined || f.price === null || f.price === "") continue;
    const label = `${code}${digits}`;
    if (out.has(label)) continue;
    out.set(label, {
      code,
      digits,
      label,
      airlineName: f.name ?? code,
      depLocal: to12h(seg.departure ?? f.departure),
      arrLocal: to12h(f.arrival),
    });
  }
  return out;
}

/* ------------------------------ route board ------------------------------ */

export async function buildRouteBoard(input: {
  origin: string;
  dest: string;
  date: string;
  carrier: string | null;
  mode: "quick" | "precise";
  deviceId: string | null;
}): Promise<RouteBoardResult> {
  const started = Date.now();
  if (!googleFlights8Enabled()) {
    return { ok: false, fromCache: false, elapsedMs: 0, flights: [], reason: "disabled" };
  }

  const filter = input.carrier ?? "all";
  const routeKey = `${input.origin}:${input.dest}:${input.date}:${filter}`;
  const boardKey = `gf8:routeday:v2:${routeKey}:${input.mode}`;
  const sameDay = input.date === new Date().toISOString().slice(0, 10);
  const ttlMinutes = sameDay
    ? NEAR_DEP_TTL_MIN
    : envInt("AIRCUE_SELLABLE_CACHE_TTL_MIN", DEFAULT_TTL_MIN);

  const cachedBoard = await readCache<BoardCachePayload>(boardKey);
  if (cachedBoard?.fresh) {
    return {
      ok: true,
      fromCache: true,
      elapsedMs: Date.now() - started,
      flights: cachedBoard.data.flights,
    };
  }

  try {
    const shared = { origin: input.origin, dest: input.dest, date: input.date, ttlMinutes };
    const [atCeiling, at1] = await Promise.all([
      routeSearchCached({ ...shared, adults: CEILING_PARTY }),
      routeSearchCached({ ...shared, adults: 1 }),
    ]);
    const top = nonstopsFrom(atCeiling, input.carrier);
    const one = nonstopsFrom(at1, input.carrier);

    const adultsHit = [CEILING_PARTY, 1];
    const flights: RouteBoardFlight[] = [];
    const tight: string[] = [];

    for (const [label, flight] of [...one, ...top]) {
      if (flights.some((f) => f.flightLabel === label)) continue;
      const bookableAtCeiling = top.has(label);
      if (!bookableAtCeiling) tight.push(label);
      flights.push({
        airlineCode: flight.code,
        airlineName: flight.airlineName,
        flightNumber: flight.digits,
        flightLabel: label,
        depLocal: flight.depLocal,
        arrLocal: flight.arrLocal,
        bucket: bookableAtCeiling ? "9+" : "1-8",
        largestN: bookableAtCeiling ? CEILING_PARTY : null,
      });
    }

    if (input.mode === "precise" && tight.length > 0) {
      const pending = new Set(tight);
      for (const n of STEPDOWN) {
        if (pending.size === 0) break;
        const body = await routeSearchCached({ ...shared, adults: n });
        adultsHit.push(n);
        const present = nonstopsFrom(body, input.carrier);
        for (const label of [...pending]) {
          if (!present.has(label)) continue;
          const row = flights.find((f) => f.flightLabel === label);
          if (row) row.largestN = n;
          pending.delete(label);
        }
      }
    }

    flights.sort((a, b) => a.depLocal.localeCompare(b.depLocal));

    await writeCache(boardKey, { flights, builtAt: new Date().toISOString() }, ttlMinutes);
    await supabaseAdmin.from("serpapi_usage_log").insert(
      adultsHit.map((adults) => ({
        purpose: "route_board_gf8",
        route_key: routeKey,
        flight_label: null,
        adults,
        bucket: null,
        device_id: input.deviceId,
        trip_id: null,
      })),
    );

    if (flights.length === 0) {
      return { ok: false, fromCache: false, elapsedMs: Date.now() - started, flights: [], reason: "empty" };
    }
    return { ok: true, fromCache: false, elapsedMs: Date.now() - started, flights };
  } catch (error) {
    console.error("gf8 route board failed", routeKey, error);
    return { ok: false, fromCache: false, elapsedMs: Date.now() - started, flights: [], reason: "error" };
  }
}
