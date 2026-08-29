/**
 * GF8 multi-segment itinerary candidate discovery.
 * One broad search; local access filter; reject malformed provider data.
 * Does not fabricate missing times.
 */
import { buildOptionKey } from "@/lib/aircue/option-key";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API_HOST = "google-flights8.p.rapidapi.com";
const MIN_LAYOVER_MIN = 45;
const MAX_LAYOVER_MIN = 24 * 60; // align with generous connection caps

export interface Gf8ItinerarySegment {
  carrier: string;
  flightNumber: string;
  flightLabel: string;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  /** ISO-ish UTC when parseable from provider; may be empty if only local known. */
  schedDepUtc: string;
  schedArrUtc: string;
}

export interface CommercialFare {
  amount: number;
  currency: string;
  bookingUrl?: string | null;
}

export interface Gf8ItineraryCandidate {
  optionKey: string;
  kind: "nonstop" | "connection";
  hub: string | null;
  origin: string;
  dest: string;
  carriers: string[];
  segments: Gf8ItinerarySegment[];
  flightLabel: string;
  depLocal: string;
  arrLocal: string;
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  commercialFare: CommercialFare | null;
  standbyClears: number;
}

interface Gf8Segment {
  from?: string;
  to?: string;
  departure?: string;
  arrival?: string;
  airline?: string;
  flight_number?: string;
}

interface Gf8Flight {
  name?: string;
  departure?: string;
  arrival?: string;
  price?: string | number;
  currency?: string;
  booking_token?: string;
  bookingUrl?: string;
  deep_link?: string;
  segments?: Gf8Segment[];
}

interface Gf8Response {
  success?: boolean;
  flights?: Gf8Flight[];
}

function googleFlights8Enabled(): boolean {
  const flag = process.env["GOOGLE_FLIGHTS8_ENABLED"];
  if (flag && flag.toLowerCase() === "false") return false;
  return Boolean(process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"]);
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

/** Prefer ISO minute key when the provider gave a parseable datetime. */
function toIsoMinute(raw: string | undefined): string {
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
  return "";
}

function parsePrice(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseInstant(raw: string | undefined): number | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export type ItineraryRejectReason =
  | "missing_times"
  | "od_break"
  | "bad_order"
  | "impossible_chronology"
  | "layover_too_short"
  | "layover_too_long"
  | "incomplete_carrier";

/** Validate normalized segments; do not fabricate data. */
export function validateItinerarySegments(
  segments: Gf8ItinerarySegment[],
): { ok: true } | { ok: false; reason: ItineraryRejectReason } {
  if (segments.length === 0) return { ok: false, reason: "incomplete_carrier" };
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    if (!s.carrier || !s.flightNumber || !s.origin || !s.dest) {
      return { ok: false, reason: "incomplete_carrier" };
    }
    if (!s.depLocal || !s.arrLocal) {
      return { ok: false, reason: "missing_times" };
    }
    if (i > 0) {
      const prev = segments[i - 1]!;
      if (prev.dest.toUpperCase() !== s.origin.toUpperCase()) {
        return { ok: false, reason: "od_break" };
      }
      const prevArr = parseInstant(prev.schedArrUtc) ?? parseInstant(prev.arrLocal);
      const nextDep = parseInstant(s.schedDepUtc) ?? parseInstant(s.depLocal);
      // Only enforce chronology when both sides have parseable instants.
      if (prevArr != null && nextDep != null) {
        if (nextDep <= prevArr) return { ok: false, reason: "impossible_chronology" };
        const layoverMin = (nextDep - prevArr) / 60_000;
        if (layoverMin < MIN_LAYOVER_MIN) return { ok: false, reason: "layover_too_short" };
        if (layoverMin > MAX_LAYOVER_MIN) return { ok: false, reason: "layover_too_long" };
      }
    }
  }
  return { ok: true };
}

function normalizeFlight(f: Gf8Flight): Gf8ItineraryCandidate | null {
  const rawSegs = f.segments ?? [];
  if (rawSegs.length === 0) return null;

  const segments: Gf8ItinerarySegment[] = [];
  for (let i = 0; i < rawSegs.length; i++) {
    const seg = rawSegs[i]!;
    const carrier = (seg.airline ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const flightNumber = String(seg.flight_number ?? "").replace(/[^0-9]/g, "");
    const origin = (seg.from ?? "").toUpperCase();
    const dest = (seg.to ?? "").toUpperCase();
    const depRaw = seg.departure ?? (i === 0 ? f.departure : undefined);
    const arrRaw = seg.arrival ?? (i === rawSegs.length - 1 ? f.arrival : undefined);
    const depLocal = to12h(depRaw);
    const arrLocal = to12h(arrRaw);
    if (!carrier || !flightNumber || origin.length !== 3 || dest.length !== 3) return null;
    segments.push({
      carrier,
      flightNumber,
      flightLabel: `${carrier}${flightNumber}`,
      origin,
      dest,
      depLocal,
      arrLocal,
      schedDepUtc: toIsoMinute(depRaw),
      schedArrUtc: toIsoMinute(arrRaw),
    });
  }

  const check = validateItinerarySegments(segments);
  if (!check.ok) return null;

  const first = segments[0]!;
  const last = segments[segments.length - 1]!;
  const optionKey = buildOptionKey(
    segments.map((s) => ({
      carrier: s.carrier,
      flightNumber: s.flightNumber,
      origin: s.origin,
      dest: s.dest,
      schedDepUtc: s.schedDepUtc || null,
      depLocal: s.depLocal,
    })),
  );
  const amount = parsePrice(f.price);
  const currency = (f.currency ?? "USD").toUpperCase();
  const bookingUrl = f.bookingUrl ?? f.deep_link ?? null;

  const flightLabel =
    segments.length === 1
      ? first.flightLabel
      : segments.map((s) => `${s.carrier} ${s.flightNumber}`).join(" → ");

  return {
    optionKey,
    kind: segments.length === 1 ? "nonstop" : "connection",
    hub: segments.length >= 2 ? segments[0]!.dest : null,
    origin: first.origin,
    dest: last.dest,
    carriers: segments.map((s) => s.carrier),
    segments,
    flightLabel,
    depLocal: first.depLocal,
    arrLocal: last.arrLocal,
    schedDepUtc: first.schedDepUtc || null,
    schedArrUtc: last.schedArrUtc || null,
    commercialFare:
      amount != null
        ? { amount, currency, bookingUrl }
        : null,
    standbyClears: segments.length,
  };
}

/** Keep only itineraries whose every marketing carrier is in the access set. */
export function filterCandidatesByAccess(
  candidates: Gf8ItineraryCandidate[],
  allowedCarriers: string[] | null,
): Gf8ItineraryCandidate[] {
  if (!allowedCarriers || allowedCarriers.length === 0) return [];
  const allowed = new Set(allowedCarriers.map((c) => c.toUpperCase()));
  return candidates.filter((c) => c.carriers.every((code) => allowed.has(code)));
}

async function readCache(key: string): Promise<Gf8Response | null> {
  const { data: row } = await supabaseAdmin
    .from("source_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row.payload as Gf8Response;
}

async function writeCache(key: string, payload: Gf8Response, ttlMinutes: number): Promise<void> {
  const now = Date.now();
  await supabaseAdmin.from("source_cache").upsert({
    cache_key: key,
    payload: payload as never,
    fetched_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttlMinutes * 60 * 1000).toISOString(),
  });
}

/**
 * One broad GF8 search (unfiltered by carrier). Caller applies access filter.
 */
export async function searchItineraryCandidates(input: {
  origin: string;
  dest: string;
  date: string;
  adults?: number;
}): Promise<{ ok: boolean; candidates: Gf8ItineraryCandidate[]; reason?: string }> {
  if (!googleFlights8Enabled()) {
    return { ok: false, candidates: [], reason: "disabled" };
  }
  const adults = input.adults ?? 1;
  const key = `gf8:itineraries:v1:${input.origin}:${input.dest}:${input.date}:${adults}`;
  try {
    let body = await readCache(key);
    if (!body) {
      const apiKey = process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"];
      if (!apiKey) return { ok: false, candidates: [], reason: "disabled" };
      const qs = new URLSearchParams({
        origin: input.origin,
        destination: input.dest,
        date: input.date,
        trip_type: "one-way",
        adults: String(adults),
        currency: "USD",
      });
      const res = await fetch(`https://${API_HOST}/api/v1/search?${qs}`, {
        headers: { "x-rapidapi-host": API_HOST, "x-rapidapi-key": apiKey },
      });
      if (!res.ok) return { ok: false, candidates: [], reason: "error" };
      body = (await res.json()) as Gf8Response;
      await writeCache(key, body, 120);
    }

    const byKey = new Map<string, Gf8ItineraryCandidate>();
    for (const f of body.flights ?? []) {
      const normalized = normalizeFlight(f);
      if (!normalized) continue;
      if (
        normalized.origin !== input.origin.toUpperCase() ||
        normalized.dest !== input.dest.toUpperCase()
      ) {
        continue;
      }
      if (!byKey.has(normalized.optionKey)) byKey.set(normalized.optionKey, normalized);
    }
    return { ok: true, candidates: [...byKey.values()] };
  } catch (error) {
    console.error("[searchItineraryCandidates]", error);
    return { ok: false, candidates: [], reason: "error" };
  }
}

/** Test helper: normalize + validate a raw GF8 flight shape. */
export function normalizeGf8FlightForTest(f: Gf8Flight): Gf8ItineraryCandidate | null {
  return normalizeFlight(f);
}
