/** Server-only, cache-first fetchers for the free data sources (FAA, AWC, NWS). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UA = "Aircue/1.0 (standby pressure monitor; contact: support@aircue.app)";

export interface SourceResult<T> {
  ok: boolean;
  stale: boolean;
  data: T | null;
  fetchedAt: string;
}

/**
 * Short-lived in-process memo. Success entries stop repeat DB round-trips
 * inside one request; failure entries stop a broken upstream from being
 * re-hit once per leg (12 legs x 2 AWC calls used to retry serially).
 */
const memo = new Map<string, { until: number; value: SourceResult<unknown> }>();
const NEGATIVE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 6000;

async function cached<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<SourceResult<T>> {
  const now = Date.now();

  const hit = memo.get(cacheKey);
  if (hit && hit.until > now) return hit.value as SourceResult<T>;

  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, fetched_at, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (row && new Date(row.expires_at).getTime() > now) {
    const result: SourceResult<T> = {
      ok: true,
      stale: false,
      data: row.payload as T,
      fetchedAt: row.fetched_at,
    };
    memo.set(cacheKey, { until: now + 30_000, value: result });
    return result;
  }

  try {
    const fresh = await fetcher();
    const fetchedAt = new Date(now).toISOString();
    await supabaseAdmin.from("source_cache").upsert({
      cache_key: cacheKey,
      payload: fresh as never,
      fetched_at: fetchedAt,
      expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
    });
    const result: SourceResult<T> = { ok: true, stale: false, data: fresh, fetchedAt };
    memo.set(cacheKey, { until: now + 30_000, value: result });
    return result;
  } catch (error) {
    console.error(`source fetch failed: ${cacheKey}`, error);
    const result: SourceResult<T> = row
      ? { ok: true, stale: true, data: row.payload as T, fetchedAt: row.fetched_at }
      : { ok: false, stale: false, data: null, fetchedAt: new Date(now).toISOString() };
    memo.set(cacheKey, { until: now + NEGATIVE_TTL_MS, value: result });
    return result;
  }
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return (await res.json()) as T;
}


/* ----------------------------- FAA NAS status ----------------------------- */

export type FaaProgramType = "ground_stop" | "ground_delay" | "closure" | "delay";

export interface FaaProgram {
  airport: string;
  type: FaaProgramType;
  reason: string | null;
  endTime: string | null;
  average: string | null;
}

const FAA_URL = "https://nasstatus.faa.gov/api/airport-status-information";

function tag(chunk: string, name: string): string | null {
  const m = chunk.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"));
  return m?.[1]?.trim() || null;
}

function programType(sectionName: string): FaaProgramType | null {
  const n = sectionName.toLowerCase();
  if (n.includes("ground stop")) return "ground_stop";
  if (n.includes("ground delay")) return "ground_delay";
  if (n.includes("closure")) return "closure";
  if (n.includes("delay")) return "delay";
  return null;
}

export function parseFaaXml(xml: string): FaaProgram[] {
  const out: FaaProgram[] = [];
  const sections = xml.split(/<Delay_type>/i).slice(1);
  for (const section of sections) {
    const type = programType(tag(section, "Name") ?? "");
    if (!type) continue;
    const parts = section.split(/<ARPT>/i).slice(1);
    for (const part of parts) {
      const airport = part.slice(0, part.indexOf("<")).trim().toUpperCase();
      if (!airport) continue;
      const window = part.slice(0, 900);
      out.push({
        airport: airport.length === 4 && airport.startsWith("K") ? airport.slice(1) : airport,
        type,
        reason: tag(window, "Reason"),
        endTime: tag(window, "End_Time") ?? tag(window, "End"),
        average: tag(window, "Avg") ?? tag(window, "Max"),
      });
    }
  }
  return out;
}

export async function getFaaPrograms(): Promise<SourceResult<FaaProgram[]>> {
  return cached("faa:nas:all", 300, async () => parseFaaXml(await getText(FAA_URL)));
}

/* --------------------------------- AWC ----------------------------------- */

export { icaoForAirport } from "@/lib/aircue/airport-lookup.server";


export interface TafReport {
  icaoId?: string;
  rawTAF?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
}

export interface MetarReport {
  icaoId?: string;
  rawOb?: string;
  visib?: number | string;
  wspd?: number;
  wgst?: number;
  wxString?: string | null;
  reportTime?: string;
}

export async function getTaf(icao: string): Promise<SourceResult<TafReport[]>> {
  return cached(`awc:taf:${icao}`, 1800, () =>
    getJson<TafReport[]>(
      `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json`,
    ),
  );
}

export async function getMetar(icao: string): Promise<SourceResult<MetarReport[]>> {
  return cached(`awc:metar:${icao}`, 600, () =>
    getJson<MetarReport[]>(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`),
  );
}

/* --------------------------------- NWS ----------------------------------- */

export interface NwsAlert {
  properties?: {
    event?: string;
    headline?: string;
    severity?: string;
    onset?: string;
    effective?: string;
    ends?: string;
    expires?: string;
  };
}

export async function getNwsAlerts(
  lat: number,
  lon: number,
): Promise<SourceResult<NwsAlert[]>> {
  const key = `nws:alerts:${lat.toFixed(2)},${lon.toFixed(2)}`;
  return cached(key, 600, async () => {
    const body = await getJson<{ features?: NwsAlert[] }>(
      `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
    );
    return body.features ?? [];
  });
}
