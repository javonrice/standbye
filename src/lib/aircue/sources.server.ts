/** Server-only, cache-first fetchers for the free data sources (FAA, AWC, NWS). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UA = "Aircue/1.0 (standby pressure monitor; contact: support@aircue.app)";

export interface SourceResult<T> {
  ok: boolean;
  stale: boolean;
  data: T | null;
  fetchedAt: string;
}

async function cached<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<SourceResult<T>> {
  const now = Date.now();
  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, fetched_at, expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (row && new Date(row.expires_at).getTime() > now) {
    return { ok: true, stale: false, data: row.payload as T, fetchedAt: row.fetched_at };
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
    return { ok: true, stale: false, data: fresh, fetchedAt };
  } catch (error) {
    console.error(`source fetch failed: ${cacheKey}`, error);
    if (row) {
      return { ok: true, stale: true, data: row.payload as T, fetchedAt: row.fetched_at };
    }
    return { ok: false, stale: false, data: null, fetchedAt: new Date(now).toISOString() };
  }
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
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

export function icaoFor(iata: string, state: string | null): string {
  if (state === "HI" || state === "AK") return `P${iata}`;
  return `K${iata}`;
}

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
      `https://aviationweather.gov/api/data/taf?ids=${icao}&format=json&hours=24`,
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
