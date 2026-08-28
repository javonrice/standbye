/**
 * Standbye sellable tightness probe (SerpAPI Google Flights).
 *
 * Party-size trick: search one-way economy for the trip's carrier/date with
 * adults=9. If the exact flight is still bookable at 9, bucket is "9+".
 * Otherwise step down (7, 5, 4, 3, 2, 1) to find the largest party size that
 * still returns the flight with a price. Never bookable → "0".
 *
 * Output is a coarse public-inventory bucket, never airline load data.
 * Server-only: reads SERPAPI_API_KEY, writes source_cache + serpapi_usage_log.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_TTL_MIN = 120;
const NEAR_DEP_TTL_MIN = 60;
const NEAR_DEP_HOURS = 6;
const DEFAULT_DEVICE_MONTHLY_CAP = 25;
const DEFAULT_GLOBAL_MONTHLY_CAP = 240;
/** Max fresh probes spent on a single watched trip. */
const WATCH_TRIP_PROBE_CAP = 5;
/** adults=9 route search is shared across the whole bank that day. */
const STEPDOWN = [7, 5, 4, 3, 2, 1] as const;

export type SellableBucket = "9+" | "1-8" | "0";

export interface SellableResult {
  ok: boolean;
  bucket: SellableBucket | null;
  largestN: number | null;
  adultsTested: number[];
  fromCache: boolean;
  /** Why the probe did not run (no key, capped, error). */
  reason?: string;
}

interface SerpFlightSegment {
  flight_number?: string;
  airline?: string;
  departure_airport?: { id?: string; time?: string };
  arrival_airport?: { id?: string; time?: string };
}

interface SerpItinerary {
  price?: number;
  flights?: SerpFlightSegment[];
}

interface SerpSearchResponse {
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
}


export function serpApiEnabled(): boolean {
  const flag = process.env["SERPAPI_ENABLED"];
  if (flag && flag.toLowerCase() === "false") return false;
  return Boolean(process.env["SERPAPI_API_KEY"]);
}

function normalizeFlightNumber(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/* -------------------------------- budgets -------------------------------- */

async function deviceProbesThisMonth(deviceId: string | null): Promise<number> {
  if (!deviceId) return 0;
  const { data, error } = await supabaseAdmin.rpc("serpapi_probes_this_month", {
    _device_id: deviceId,
  });
  if (error) {
    console.error("serpapi_probes_this_month failed", error);
    return DEFAULT_DEVICE_MONTHLY_CAP; // fail closed
  }
  return typeof data === "number" ? data : 0;
}

async function globalProbesThisMonth(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("serpapi_probes_this_month");
  if (error) return DEFAULT_GLOBAL_MONTHLY_CAP; // fail closed
  return typeof data === "number" ? data : 0;
}

async function tripProbeCount(tripId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("serpapi_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("adults", 9); // one adults=9 row per fresh probe; step-down rows don't count
  return count ?? 0;
}

async function logProbe(entry: {
  routeKey: string;
  flightLabel: string;
  adults: number;
  bucket: SellableBucket | null;
  deviceId: string | null;
  tripId: string;
}): Promise<void> {
  await supabaseAdmin.from("serpapi_usage_log").insert({
    purpose: "sellable_probe",
    route_key: entry.routeKey,
    flight_label: entry.flightLabel,
    adults: entry.adults,
    bucket: entry.bucket,
    device_id: entry.deviceId,
    trip_id: entry.tripId,
  });
}

/* -------------------------------- caching -------------------------------- */

interface FlightCachePayload {
  bucket: SellableBucket;
  largestN: number | null;
  adultsTested: number[];
  checkedAt: string;
}

async function readCache<T>(key: string): Promise<{ data: T; fresh: boolean } | null> {
  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!row) return null;
  return {
    data: row.payload as T,
    fresh: new Date(row.expires_at).getTime() > Date.now(),
  };
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

async function searchFlights(params: {
  origin: string;
  dest: string;
  date: string;
  carrier: string;
  adults: number;
  nonstopOnly: boolean;
}): Promise<SerpSearchResponse> {
  const key = process.env["SERPAPI_API_KEY"];
  if (!key) throw new Error("SERPAPI_API_KEY is not configured");
  const qs = new URLSearchParams({
    engine: "google_flights",
    type: "2",
    departure_id: params.origin,
    arrival_id: params.dest,
    outbound_date: params.date,
    adults: String(params.adults),
    travel_class: "1",
    include_airlines: params.carrier,
    stops: params.nonstopOnly ? "1" : "0",
    hl: "en",
    gl: "us",
    currency: "USD",
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${qs}`);
  if (!res.ok) throw new Error(`SerpAPI responded ${res.status}`);
  return (await res.json()) as SerpSearchResponse;
}

/** Single-segment itinerary whose flight number matches, with a price. */
function flightIsBookable(body: SerpSearchResponse, flightNormal: string): boolean {
  const itineraries = [...(body.best_flights ?? []), ...(body.other_flights ?? [])];
  return itineraries.some(
    (it) =>
      typeof it.price === "number" &&
      (it.flights ?? []).length === 1 &&
      normalizeFlightNumber(it.flights![0]!.flight_number ?? "") === flightNormal,
  );
}

/* --------------------------------- probe --------------------------------- */

export async function probeSellable(input: {
  tripId: string;
  flightLabel: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  dest: string;
  date: string;
  schedDepUtc: string | null;
  deviceId: string | null;
}): Promise<SellableResult> {
  // SerpAPI returns flight numbers with the carrier prefix ("UA 2311"), while
  // trips store only the digits ("2311") — normalize both to "UA2311".
  const rawFlight = normalizeFlightNumber(input.flightNumber);
  const flightNormal = /^[A-Z]/.test(rawFlight)
    ? rawFlight
    : normalizeFlightNumber(`${input.carrier}${rawFlight}`);
  if (!serpApiEnabled()) return { ok: false, bucket: null, largestN: null, adultsTested: [], fromCache: false, reason: "disabled" };
  if (!flightNormal || flightNormal === "0" || input.carrier === "ALL") {
    return { ok: false, bucket: null, largestN: null, adultsTested: [], fromCache: false, reason: "no-flight-number" };
  }

  const hoursToDep = input.schedDepUtc
    ? (new Date(input.schedDepUtc).getTime() - Date.now()) / 3600000
    : Infinity;
  const ttlMinutes =
    hoursToDep <= NEAR_DEP_HOURS
      ? NEAR_DEP_TTL_MIN
      : envInt("AIRCUE_SELLABLE_CACHE_TTL_MIN", DEFAULT_TTL_MIN);

  const routeKey = `${input.carrier}:${input.origin}:${input.dest}:${input.date}`;
  const flightKey = `serpapi:sellable:${routeKey}:${flightNormal}`;
  const route9Key = `serpapi:route9:${routeKey}`;

  // 1. Fresh flight-level cache → free.
  const cachedFlight = await readCache<FlightCachePayload>(flightKey);
  if (cachedFlight?.fresh) {
    return {
      ok: true,
      bucket: cachedFlight.data.bucket,
      largestN: cachedFlight.data.largestN,
      adultsTested: cachedFlight.data.adultsTested,
      fromCache: true,
    };
  }

  // Budgets only gate fresh probes.
  const deviceCap = envInt("AIRCUE_FREE_SELLABLE_PROBES_PER_MO", DEFAULT_DEVICE_MONTHLY_CAP);
  const globalCap = envInt("AIRCUE_SERPAPI_MONTHLY_CAP", DEFAULT_GLOBAL_MONTHLY_CAP);
  const [deviceUsed, globalUsed, tripUsed] = await Promise.all([
    deviceProbesThisMonth(input.deviceId),
    globalProbesThisMonth(),
    tripProbeCount(input.tripId),
  ]);
  if (deviceUsed >= deviceCap) {
    return staleOrBlocked(cachedFlight, "device-cap");
  }
  if (globalUsed >= globalCap || tripUsed >= WATCH_TRIP_PROBE_CAP) {
    return staleOrBlocked(cachedFlight, "global-cap");
  }

  const adultsTested: number[] = [];
  try {
    // 2/3. Route-level adults=9 search, shared and cached.
    let route9 = await readCache<SerpSearchResponse>(route9Key);
    if (!route9?.fresh) {
      let body = await searchFlights({
        origin: input.origin,
        dest: input.dest,
        date: input.date,
        carrier: input.carrier,
        adults: 9,
        nonstopOnly: true,
      });
      adultsTested.push(9);
      // Some Express flights vanish from the nonstop filter; retry once unfiltered.
      if (!flightIsBookable(body, flightNormal)) {
        const anyStops = await searchFlights({
          origin: input.origin,
          dest: input.dest,
          date: input.date,
          carrier: input.carrier,
          adults: 9,
          nonstopOnly: false,
        });
        if ((anyStops.best_flights?.length ?? 0) + (anyStops.other_flights?.length ?? 0) > 0) {
          body = anyStops;
        }
      }
      await logProbe({
        routeKey,
        flightLabel: input.flightLabel,
        adults: 9,
        bucket: null,
        deviceId: input.deviceId,
        tripId: input.tripId,
      });
      await writeCache(route9Key, body, ttlMinutes);
      route9 = { data: body, fresh: true };
    }

    let bucket: SellableBucket;
    let largestN: number | null = null;

    if (flightIsBookable(route9.data, flightNormal)) {
      bucket = "9+";
    } else {
      // 4. Step down until the flight appears; stop at the first hit.
      for (const n of STEPDOWN) {
        const body = await searchFlights({
          origin: input.origin,
          dest: input.dest,
          date: input.date,
          carrier: input.carrier,
          adults: n,
          nonstopOnly: false,
        });
        adultsTested.push(n);
        await logProbe({
          routeKey,
          flightLabel: input.flightLabel,
          adults: n,
          bucket: null,
          deviceId: input.deviceId,
          tripId: input.tripId,
        });
        if (flightIsBookable(body, flightNormal)) {
          bucket = "1-8";
          largestN = n;
          break;
        }
      }
      bucket = largestN === null ? "0" : "1-8";
    }

    const payload: FlightCachePayload = {
      bucket,
      largestN,
      adultsTested,
      checkedAt: new Date().toISOString(),
    };
    await writeCache(flightKey, payload, ttlMinutes);
    // Record the resolved bucket on the last probe row for reporting.
    return { ok: true, bucket, largestN, adultsTested, fromCache: false };
  } catch (error) {
    console.error("serpapi probe failed", flightKey, error);
    return staleOrBlocked(cachedFlight, "error");
  }
}

function staleOrBlocked(
  cachedFlight: { data: FlightCachePayload; fresh: boolean } | null,
  reason: string,
): SellableResult {
  if (cachedFlight) {
    return {
      ok: true,
      bucket: cachedFlight.data.bucket,
      largestN: cachedFlight.data.largestN,
      adultsTested: cachedFlight.data.adultsTested,
      fromCache: true,
      reason,
    };
  }
  return { ok: false, bucket: null, largestN: null, adultsTested: [], fromCache: false, reason };
}

/* ------------------------------ route board ------------------------------ */

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

interface BoardCachePayload {
  flights: RouteBoardFlight[];
  builtAt: string;
}

/** One-way economy nonstop search at a given party size, cached per route+adults. */
async function routeSearchCached(params: {
  origin: string;
  dest: string;
  date: string;
  carrier: string | null;
  adults: number;
  ttlMinutes: number;
}): Promise<SerpSearchResponse> {
  const filter = params.carrier ?? "all";
  const key = `serpapi:routeN:${params.origin}:${params.dest}:${params.date}:${params.adults}:${filter}`;
  const cached = await readCache<SerpSearchResponse>(key);
  if (cached?.fresh) return cached.data;

  const apiKey = process.env["SERPAPI_API_KEY"];
  if (!apiKey) throw new Error("SERPAPI_API_KEY is not configured");
  const qs = new URLSearchParams({
    engine: "google_flights",
    type: "2",
    departure_id: params.origin,
    arrival_id: params.dest,
    outbound_date: params.date,
    adults: String(params.adults),
    travel_class: "1",
    stops: "1", // nonstop only
    hl: "en",
    gl: "us",
    currency: "USD",
    api_key: apiKey,
  });
  if (params.carrier) qs.set("include_airlines", params.carrier);
  const res = await fetch(`https://serpapi.com/search.json?${qs}`);
  if (!res.ok) throw new Error(`SerpAPI responded ${res.status}`);
  const body = (await res.json()) as SerpSearchResponse;
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

function localTime(raw: string | undefined): string {
  if (!raw) return "";
  const time = raw.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, m] = time.split(":").map(Number);
  const hour12 = (h ?? 0) % 12 || 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}

/** Single-segment priced itineraries, keyed by normalized flight number. */
function nonstopsFrom(body: SerpSearchResponse): Map<string, Nonstop> {
  const out = new Map<string, Nonstop>();
  for (const it of [...(body.best_flights ?? []), ...(body.other_flights ?? [])]) {
    if (typeof it.price !== "number") continue;
    const segments = it.flights ?? [];
    if (segments.length !== 1) continue;
    const seg = segments[0]!;
    const label = normalizeFlightNumber(seg.flight_number ?? "");
    if (!label) continue;
    const code = label.slice(0, 2);
    const digits = label.slice(2);
    if (!digits) continue;
    if (!out.has(label)) {
      out.set(label, {
        code,
        digits,
        label,
        airlineName: seg.airline ?? code,
        depLocal: localTime(seg.departure_airport?.time),
        arrLocal: localTime(seg.arrival_airport?.time),
      });
    }
  }
  return out;
}

/**
 * Route day board: every nonstop that is still sellable in the public search,
 * with a coarse Standbye bucket. Quick mode runs adults=9 (bucket "9+") plus
 * adults=1 (everything else, bucket "1-8"). Precise mode steps the shared
 * levels down to pin the exact largest party size.
 */
export async function buildRouteBoard(input: {
  origin: string;
  dest: string;
  date: string;
  carrier: string | null;
  mode: "quick" | "precise";
  deviceId: string | null;
}): Promise<RouteBoardResult> {
  const started = Date.now();
  if (!serpApiEnabled()) {
    return { ok: false, fromCache: false, elapsedMs: 0, flights: [], reason: "disabled" };
  }

  const filter = input.carrier ?? "all";
  const routeKey = `${input.origin}:${input.dest}:${input.date}:${filter}`;
  const boardKey = `serpapi:routeday:${routeKey}:${input.mode}`;
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
    const shared = { origin: input.origin, dest: input.dest, date: input.date, carrier: input.carrier, ttlMinutes };
    const [at9, at1] = await Promise.all([
      routeSearchCached({ ...shared, adults: 9 }),
      routeSearchCached({ ...shared, adults: 1 }),
    ]);
    const nine = nonstopsFrom(at9);
    const one = nonstopsFrom(at1);

    const adultsHit = [9, 1];
    const flights: RouteBoardFlight[] = [];
    const tight: string[] = [];

    for (const [label, flight] of [...one, ...nine]) {
      if (flights.some((f) => f.flightLabel === label)) continue;
      const bookableAt9 = nine.has(label);
      if (!bookableAt9) tight.push(label);
      flights.push({
        airlineCode: flight.code,
        airlineName: flight.airlineName,
        flightNumber: flight.digits,
        flightLabel: label,
        depLocal: flight.depLocal,
        arrLocal: flight.arrLocal,
        bucket: bookableAt9 ? "9+" : "1-8",
        largestN: bookableAt9 ? 9 : null,
      });
    }

    if (input.mode === "precise" && tight.length > 0) {
      const pending = new Set(tight);
      for (const n of STEPDOWN) {
        if (pending.size === 0) break;
        const body = await routeSearchCached({ ...shared, adults: n });
        adultsHit.push(n);
        const present = nonstopsFrom(body);
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
        purpose: "route_board",
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
    console.error("route board failed", routeKey, error);
    return { ok: false, fromCache: false, elapsedMs: Date.now() - started, flights: [], reason: "error" };
  }
}
