/**
 * AeroDataBox (RapidAPI Basic, $0) client.
 *
 * Budget: 600 API units / month, 2400 requests / month, 1 request / second.
 * Every call here is Tier 2 (2 units). Tier 3/4 endpoints are deliberately unused.
 * Never import this from client code — it reads the RapidAPI key from the server env.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const HOST = "aerodatabox.p.rapidapi.com";
const MONTHLY_UNIT_BUDGET = 600;
/** Below this many remaining units we stop calling and fall back to manual entry. */
const SOFT_STOP_REMAINING = 50;
/** Per-device guard so one visitor cannot drain the month in an afternoon. */
const DEVICE_RESOLVES_PER_DAY = 20;
const TIER2_UNITS = 2;

const STATUS_TTL_SECONDS = 24 * 3600;
const FIDS_TTL_SECONDS = 3600;

export interface AdbFlight {
  number?: string;
  status?: string;
  airline?: { name?: string; iata?: string };
  departure?: AdbMovement;
  arrival?: AdbMovement;
  /** Airport boards return the *other* endpoint here, not departure/arrival. */
  movement?: AdbMovement;
  aircraft?: { reg?: string; model?: string };
}

interface AdbMovement {
  airport?: { iata?: string; icao?: string; name?: string };
  scheduledTime?: { utc?: string; local?: string };
  revisedTime?: { utc?: string; local?: string };
  terminal?: string;
  gate?: string;
}

export function aeroDataBoxEnabled(): boolean {
  const flag = process.env["AERODATABOX_ENABLED"];
  if (flag && flag.toLowerCase() === "false") return false;
  return Boolean(process.env["AERODATABOX_RAPIDAPI_KEY"]);
}

/* ------------------------------ unit budget ------------------------------ */

async function unitsUsedThisMonth(): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("api_units_this_month", {
    _provider: "aerodatabox",
  });
  if (error) {
    console.error("api_units_this_month failed", error);
    // Fail closed: assume the budget is spent rather than risk overspending.
    return MONTHLY_UNIT_BUDGET;
  }
  return typeof data === "number" ? data : 0;
}

export async function unitsRemaining(): Promise<number> {
  return Math.max(0, MONTHLY_UNIT_BUDGET - (await unitsUsedThisMonth()));
}

async function budgetAllows(units: number): Promise<boolean> {
  const remaining = await unitsRemaining();
  return remaining - units >= SOFT_STOP_REMAINING;
}

async function logUsage(endpoint: string, units: number, tripId?: string): Promise<void> {
  await supabaseAdmin.from("api_usage_log").insert({
    provider: "aerodatabox",
    endpoint,
    tier_est: 2,
    units_est: units,
    trip_id: tripId ?? null,
  });
}

/** Device-level daily cap on live resolves. */
export async function deviceResolveAllowed(deviceId: string | undefined): Promise<boolean> {
  if (!deviceId) return true;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await supabaseAdmin
    .from("api_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", `resolve:${deviceId}`)
    .gte("created_at", since);
  return (count ?? 0) < DEVICE_RESOLVES_PER_DAY;
}

async function noteDeviceResolve(deviceId: string | undefined): Promise<void> {
  if (!deviceId) return;
  await supabaseAdmin.from("api_usage_log").insert({
    provider: "aerodatabox",
    endpoint: `resolve:${deviceId}`,
    tier_est: 0,
    units_est: 0,
  });
}

/* ------------------------------ rate limiting ----------------------------- */

let lastCallAt = 0;

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, 1000 - (Date.now() - lastCallAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  return fn();
}

/* --------------------------------- fetch --------------------------------- */

async function callApi<T>(path: string): Promise<T> {
  const key = process.env["AERODATABOX_RAPIDAPI_KEY"];
  if (!key) throw new Error("AERODATABOX_RAPIDAPI_KEY is not configured");

  return rateLimited(async () => {
    let res = await fetch(`https://${HOST}${path}`, {
      headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST, Accept: "application/json" },
    });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await fetch(`https://${HOST}${path}`, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST, Accept: "application/json" },
      });
    }
    if (res.status === 404) return [] as unknown as T;
    if (!res.ok) throw new Error(`AeroDataBox ${path} responded ${res.status}`);
    return (await res.json()) as T;
  });
}

/** Cache-first wrapper. Only a cache miss costs units. */
async function cachedCall<T>(
  cacheKey: string,
  ttlSeconds: number,
  endpoint: string,
  path: string,
  opts: { tripId?: string | undefined; force?: boolean | undefined } = {},
): Promise<{ data: T | null; fromCache: boolean; budgetBlocked: boolean }> {
  const now = Date.now();
  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  const fresh = row && new Date(row.expires_at).getTime() > now;
  if (row && (fresh || !opts.force) && fresh) {
    return { data: row.payload as T, fromCache: true, budgetBlocked: false };
  }

  if (!(await budgetAllows(TIER2_UNITS))) {
    return {
      data: (row?.payload as T) ?? null,
      fromCache: Boolean(row),
      budgetBlocked: true,
    };
  }

  try {
    const payload = await callApi<T>(path);
    await logUsage(endpoint, TIER2_UNITS, opts.tripId);
    await supabaseAdmin.from("source_cache").upsert({
      cache_key: cacheKey,
      payload: payload as never,
      fetched_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
    });
    return { data: payload, fromCache: false, budgetBlocked: false };
  } catch (error) {
    console.error("aerodatabox call failed", endpoint, error);
    await logUsage(`${endpoint}:error`, TIER2_UNITS, opts.tripId);
    return { data: (row?.payload as T) ?? null, fromCache: Boolean(row), budgetBlocked: false };
  }
}

/* -------------------------------- endpoints ------------------------------- */

/**
 * Tier 2: every leg flown under this flight number on that local date. Cached 24h.
 * A number like UA1448 can operate RDU→ORD and then ORD→IAH, so callers must
 * pick the leg the traveller means instead of assuming the first one.
 */
export async function fetchFlightLegs(
  flightNumber: string,
  travelDate: string,
  opts: { tripId?: string | undefined; deviceId?: string | undefined; force?: boolean | undefined } = {},
): Promise<{ flights: AdbFlight[]; budgetBlocked: boolean }> {
  if (!aeroDataBoxEnabled()) return { flights: [], budgetBlocked: true };

  const number = flightNumber.replace(/\s+/g, "").toUpperCase();
  const cacheKey = `adb:status:${number}:${travelDate}`;

  const cachedRow = await supabaseAdmin
    .from("source_cache")
    .select("cache_key")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  // Only a cache miss counts against the per-device daily cap.
  if (!cachedRow.data && !(await deviceResolveAllowed(opts.deviceId))) {
    return { flights: [], budgetBlocked: true };
  }

  const result = await cachedCall<AdbFlight[]>(
    cacheKey,
    STATUS_TTL_SECONDS,
    "flight-status",
    `/flights/number/${encodeURIComponent(number)}/${travelDate}?withAircraftImage=false&withLocation=false`,
    { tripId: opts.tripId, force: opts.force },
  );

  if (!result.fromCache && result.data) await noteDeviceResolve(opts.deviceId);

  const list = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  return { flights: list, budgetBlocked: result.budgetBlocked };
}

/** One leg: the one departing `origin` when given, otherwise the first of the day. */
export async function fetchFlightStatus(
  flightNumber: string,
  travelDate: string,
  opts: {
    tripId?: string | undefined;
    deviceId?: string | undefined;
    force?: boolean | undefined;
    origin?: string | undefined;
    dest?: string | undefined;
  } = {},
): Promise<{ flight: AdbFlight | null; budgetBlocked: boolean }> {
  const { flights, budgetBlocked } = await fetchFlightLegs(flightNumber, travelDate, opts);
  return { flight: pickLeg(flights, opts.origin, opts.dest), budgetBlocked };
}

/** Match on origin (and destination when known); fall back to the first leg. */
export function pickLeg(
  flights: AdbFlight[],
  origin?: string | undefined,
  dest?: string | undefined,
): AdbFlight | null {
  if (flights.length === 0) return null;
  if (origin) {
    const o = origin.toUpperCase();
    const d = dest?.toUpperCase();
    const exact = flights.find(
      (f) =>
        f.departure?.airport?.iata?.toUpperCase() === o &&
        (!d || f.arrival?.airport?.iata?.toUpperCase() === d),
    );
    if (exact) return exact;
    const byOrigin = flights.find((f) => f.departure?.airport?.iata?.toUpperCase() === o);
    if (byOrigin) return byOrigin;
  }
  return flights[0] ?? null;
}


/**
 * Tier 2: departures board for one airport/day, shared across every watch. Cached 1h.
 *
 * `withLeg=true` makes each item carry the full leg — both `departure` and
 * `arrival` with real scheduled times — instead of only the queried end plus a
 * bare `movement`. Same endpoint, same single request, same 2 units, so arrival
 * times come free rather than costing a per-flight status call.
 */
export async function fetchDepartureBoard(
  iata: string,
  travelDate: string,
  windowStartLocal: string,
  windowEndLocal: string,
  cacheSuffix = "departures",
): Promise<{ departures: AdbFlight[]; budgetBlocked: boolean }> {
  if (!aeroDataBoxEnabled()) return { departures: [], budgetBlocked: true };

  // v2: payloads cached before withLeg=true carry no arrival times.
  const cacheKey = `adb:fids:v2:${iata}:${travelDate}:${cacheSuffix}`;

  const result = await cachedCall<{ departures?: AdbFlight[] }>(
    cacheKey,
    FIDS_TTL_SECONDS,
    "fids-departures",
    `/flights/airports/iata/${iata}/${windowStartLocal}/${windowEndLocal}?withLeg=true&direction=Departure&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`,
  );

  return {
    departures: result.data?.departures ?? [],
    budgetBlocked: result.budgetBlocked,
  };
}
