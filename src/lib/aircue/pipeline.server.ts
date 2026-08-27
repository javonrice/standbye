/** Signal pipeline: fetch → normalize → window filter → dedupe → roll up → score → persist → diff. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getFaaPrograms,
  getMetar,
  getNwsAlerts,
  getTaf,
  icaoFor,
  type FaaProgram,
  type SourceResult,
} from "@/lib/aircue/sources.server";
import { getFlightProvider } from "@/lib/aircue/flight-provider.server";
import {
  buildWindows,
  distanceKm,
  formatChecked,
  formatCountdown,
  formatLocalDate,
  formatLocalTime,
  overlaps,
} from "@/lib/aircue/tz";
import type {
  Brief,
  BriefStatus,
  Confidence,
  Signal,
  SignalCategory,
  SignalLocation,
} from "@/lib/aircue/data";

type CardStatus = "clear" | "elevated" | "active" | "incomplete";

interface AirportRow {
  iata: string;
  name: string;
  city: string | null;
  state: string | null;
  tz: string;
  lat: number;
  lon: number;
}

interface TripRow {
  id: string;
  flight_label: string;
  travel_date: string;
  origin_iata: string;
  dest_iata: string;
  sched_dep_utc: string | null;
  sched_arr_utc: string | null;
  dep_window_start: string | null;
  dep_window_end: string | null;
  arr_window_end: string | null;
  share_token: string | null;
}

interface SignalDraft {
  location: SignalLocation;
  category: string;
  confidence: Confidence;
  severity: number;
  title: string;
  summary: string;
  why_it_matters: string;
  evidence: Record<string, unknown>;
  source: string;
  source_url?: string;
  retrieved_at: string;
  active_from?: string | null;
  active_until?: string | null;
  fingerprint: string;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  confirmed: 1,
  strong: 0.7,
  context: 0.35,
};

/* ------------------------------ normalizers ------------------------------ */

function faaSignals(
  programs: FaaProgram[],
  airport: AirportRow,
  location: SignalLocation,
  retrievedAt: string,
  travelDate: string,
): SignalDraft[] {
  const where = location === "departure" ? "departure" : "arrival";
  return programs
    .filter((p) => p.airport === airport.iata)
    .map((program) => {
      const base = {
        location,
        source: "FAA National Airspace System status",
        source_url: "https://nasstatus.faa.gov/",
        retrieved_at: retrievedAt,
        evidence: { ...program } as Record<string, unknown>,
        active_until: null,
        active_from: null,
      };
      const place = airport.city ?? airport.iata;
      switch (program.type) {
        case "ground_stop":
          return {
            ...base,
            category: "faa_program",
            confidence: "confirmed" as Confidence,
            severity: 95,
            title: `Ground stop at ${airport.iata}`,
            summary: `The FAA has a ground stop in effect at ${place}${program.reason ? ` (${program.reason.toLowerCase()})` : ""}.`,
            why_it_matters: `Flights are being held, so ${where} timing can shift and displaced passengers may be rebooked onto later flights.`,
            fingerprint: `faa:ground_stop:${airport.iata}:${travelDate}`,
          };
        case "closure":
          return {
            ...base,
            category: "faa_program",
            confidence: "confirmed" as Confidence,
            severity: 95,
            title: `${airport.iata} closure reported`,
            summary: `An airport closure is reported at ${place}${program.reason ? ` (${program.reason.toLowerCase()})` : ""}.`,
            why_it_matters:
              "A closure stops normal operations, which usually creates a backlog of confirmed passengers ahead of standby.",
            fingerprint: `faa:closure:${airport.iata}:${travelDate}`,
          };
        case "ground_delay":
          return {
            ...base,
            category: "faa_program",
            confidence: "confirmed" as Confidence,
            severity: 80,
            title: `Ground delay program at ${airport.iata}`,
            summary: `A ground delay program is active at ${place}${program.average ? `, averaging ${program.average}` : ""}.`,
            why_it_matters:
              "Metered arrivals reduce flexibility in your window and can push confirmed passengers onto later flights.",
            fingerprint: `faa:gdp:${airport.iata}:${travelDate}`,
          };
        default:
          return {
            ...base,
            category: "airport_ops",
            confidence: "strong" as Confidence,
            severity: 60,
            title: `Delays reported at ${airport.iata}`,
            summary: `The FAA reports elevated delays at ${place}${program.average ? ` (${program.average})` : ""}.`,
            why_it_matters:
              "Elevated delays make the day's schedule tighter, which usually reduces open seats later in the day.",
            fingerprint: `faa:delay:${airport.iata}:${travelDate}`,
          };
      }
    });
}

interface WxHit {
  label: string;
  severity: number;
  confidence: Confidence;
}

function scanWeatherText(raw: string): WxHit | null {
  const t = raw.toUpperCase();
  if (/\+TSRA|TSRA|\bTS\b|VCTS/.test(t))
    return { label: "thunderstorms", severity: 70, confidence: "strong" };
  if (/FZRA|FZDZ|\bPL\b|\bIC\b/.test(t))
    return { label: "freezing precipitation", severity: 75, confidence: "strong" };
  if (/\+SN|\bSN\b|\bBLSN\b/.test(t))
    return { label: "snow", severity: 60, confidence: "strong" };
  if (/\bFG\b|\bBR\b|1\/2SM|1\/4SM/.test(t))
    return { label: "low visibility", severity: 50, confidence: "strong" };
  if (/G[3-9]\d KT/.test(t)) return { label: "strong winds", severity: 45, confidence: "strong" };
  return null;
}

function tafSignal(
  raw: string,
  airport: AirportRow,
  location: SignalLocation,
  retrievedAt: string,
  travelDate: string,
): SignalDraft | null {
  const hit = scanWeatherText(raw);
  if (!hit) return null;
  const place = airport.city ?? airport.iata;
  const when = location === "departure" ? "your departure window" : "your arrival window";
  return {
    location,
    category: "weather",
    confidence: hit.confidence,
    severity: hit.severity,
    title: `${location === "departure" ? "Departure" : "Arrival"} weather`,
    summary: `The forecast for ${place} shows ${hit.label} around ${when}.`,
    why_it_matters:
      "Weather can slow arrivals and departures, and rebooked passengers from affected flights compete for the same later seats.",
    evidence: { rawTAF: raw.slice(0, 400) },
    source: "Aviation Weather Center (TAF)",
    source_url: "https://aviationweather.gov/",
    retrieved_at: retrievedAt,
    active_from: null,
    active_until: null,
    fingerprint: `awc:taf:${airport.iata}:${hit.label}:${travelDate}`,
  };
}

const ALERT_SEVERITY: Record<string, number> = {
  Extreme: 90,
  Severe: 85,
  Moderate: 60,
  Minor: 40,
};

function nwsSignals(
  alerts: { properties?: Record<string, string | undefined> }[],
  airport: AirportRow,
  location: SignalLocation,
  retrievedAt: string,
  windowStart: Date,
  windowEnd: Date,
): SignalDraft[] {
  const drafts: SignalDraft[] = [];
  for (const alert of alerts) {
    const p = alert.properties ?? {};
    const event = p["event"];
    if (!event) continue;
    if (!/storm|wind|snow|ice|winter|flood|fog|tornado|freeze|blizzard/i.test(event)) continue;
    const from = p["onset"] ?? p["effective"];
    const to = p["ends"] ?? p["expires"];
    if (!overlaps(from ? new Date(from) : null, to ? new Date(to) : null, windowStart, windowEnd))
      continue;
    const sev = ALERT_SEVERITY[p["severity"] ?? "Moderate"] ?? 55;
    drafts.push({
      location,
      category: "weather",
      confidence: sev >= 85 ? "confirmed" : "strong",
      severity: sev,
      title: `${event} near ${airport.iata}`,
      summary: `The National Weather Service has a ${event.toLowerCase()} in effect near ${airport.city ?? airport.iata}.`,
      why_it_matters:
        "Active weather alerts often lead to delays or cancellations, which puts more confirmed passengers on later flights.",
      evidence: { headline: p["headline"] ?? null, severity: p["severity"] ?? null },
      source: "National Weather Service",
      source_url: "https://www.weather.gov/",
      retrieved_at: retrievedAt,
      active_from: from ?? null,
      active_until: to ?? null,
      fingerprint: `nws:${airport.iata}:${event.toLowerCase().replace(/\s+/g, "-")}:${(from ?? "").slice(0, 10)}`,
    });
  }
  return drafts;
}

interface CuratedEventRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  starts_on: string;
  ends_on: string;
  demand_class: string;
}

function eventSignals(
  events: CuratedEventRow[],
  airport: AirportRow,
  location: SignalLocation,
  travelDate: string,
  retrievedAt: string,
): SignalDraft[] {
  return events.map((event) => {
    const major = event.demand_class === "major";
    const inbound = location === "arrival";
    const place = event.city ?? airport.city ?? airport.iata;
    return {
      location,
      category: "event",
      confidence: "context" as Confidence,
      severity: major ? 45 : 30,
      title: event.city ? `Event in ${place}` : "Peak travel period",
      summary: `${event.name}${event.city ? ` in ${place}` : ""} overlaps your travel date.`,
      why_it_matters: inbound
        ? "Large gatherings can raise inbound demand, so flights into the city may be fuller than usual."
        : "Crowds leaving the city can raise outbound demand, so flights out may be fuller than usual.",
      evidence: { starts_on: event.starts_on, ends_on: event.ends_on, class: event.demand_class },
      source: "Aircue curated events",
      retrieved_at: retrievedAt,
      active_from: null,
      active_until: null,
      fingerprint: `event:${event.id}:${location}:${travelDate}`,
    };
  });
}

function chainStub(retrievedAt: string, tripId: string): SignalDraft {
  return {
    location: "chain",
    category: "chain_status",
    confidence: "context",
    severity: 0,
    title: "Flight data not connected",
    summary: "Live flight status and inbound aircraft tracking are not connected yet.",
    why_it_matters:
      "Aircue cannot see delays to the aircraft flying in, or earlier cancellations on this route. Everything above is still live.",
    evidence: { provider: "manual" },
    source: "Aircue",
    retrieved_at: retrievedAt,
    active_from: null,
    active_until: null,
    fingerprint: `chain:unavailable:${tripId}`,
  };
}

/* -------------------------------- scoring -------------------------------- */

function levelFor(draft: { severity: number; confidence: Confidence; category: string }): BriefStatus {
  if (draft.category === "chain_status") return "incomplete";
  if (draft.confidence === "confirmed" && draft.severity >= 85) return "disruption";
  if (draft.severity >= 65) return "elevated";
  if (draft.severity >= 35) return "watch";
  return "clear";
}

function cardStatus(drafts: SignalDraft[], sourcesOk: boolean): CardStatus {
  if (!sourcesOk) return "incomplete";
  if (drafts.some((d) => d.confidence === "confirmed" && d.severity >= 85)) return "active";
  if (drafts.some((d) => d.severity >= 55)) return "elevated";
  return "clear";
}

function overallStatus(drafts: SignalDraft[], sourcesOk: boolean): BriefStatus {
  if (!sourcesOk) return "incomplete";
  const material = drafts.filter((d) => d.category !== "chain_status" && d.severity >= 30);
  if (material.some((d) => d.confidence === "confirmed" && d.severity >= 85)) return "disruption";
  const strong = material.filter((d) => d.confidence !== "context" && d.severity >= 55);
  if (strong.length >= 2) return "elevated";
  if (strong.length === 1 && material.length >= 2) return "elevated";
  if (material.length > 0) return "watch";
  return "clear";
}

function pressureIndex(drafts: SignalDraft[]): number {
  const sum = drafts.reduce((acc, d) => acc + d.severity * CONFIDENCE_WEIGHT[d.confidence], 0);
  return Math.max(0, Math.min(100, Math.round(sum / 1.6)));
}

function headlineFor(status: BriefStatus, drafts: SignalDraft[]): string {
  const kinds = new Set(drafts.filter((d) => d.severity >= 30).map((d) => d.category));
  switch (status) {
    case "disruption":
      return "An operational restriction is active in your window.";
    case "elevated":
      return kinds.size > 1
        ? "Several conditions overlap in your window."
        : "One significant condition sits in your window.";
    case "watch":
      return "Something is developing in your window.";
    case "incomplete":
      return "We could not check every required source.";
    default:
      return "No material outside pressure found at the last check.";
  }
}

/* -------------------------------- pipeline -------------------------------- */

export async function generateBrief(tripId: string): Promise<void> {
  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle<TripRow>();
  if (!trip) throw new Error("Trip not found");

  const { data: airports } = await supabaseAdmin
    .from("airports")
    .select("iata,name,city,state,tz,lat,lon")
    .in("iata", [trip.origin_iata, trip.dest_iata]);
  const origin = (airports ?? []).find((a) => a.iata === trip.origin_iata) as AirportRow | undefined;
  const dest = (airports ?? []).find((a) => a.iata === trip.dest_iata) as AirportRow | undefined;
  if (!origin || !dest) throw new Error("Airport reference data missing");

  const windows = {
    depStart: new Date(trip.dep_window_start ?? Date.now()),
    depEnd: new Date(trip.dep_window_end ?? Date.now()),
    arrEnd: new Date(trip.arr_window_end ?? Date.now()),
  };
  const retrievedAt = new Date().toISOString();
  const hoursToWindow = (windows.depStart.getTime() - Date.now()) / 3600000;
  // FAA programs describe right now; TAFs cover about a day. Beyond those horizons the
  // sources cannot say anything about this flight's window.
  const faaRelevant = hoursToWindow <= 12;
  const forecastRelevant = hoursToWindow <= 30;

  const [faa, depTaf, arrTaf, depMetar, arrMetar, depAlerts, arrAlerts] = await Promise.all([
    getFaaPrograms(),
    getTaf(icaoFor(origin.iata, origin.state)),
    getTaf(icaoFor(dest.iata, dest.state)),
    getMetar(icaoFor(origin.iata, origin.state)),
    getMetar(icaoFor(dest.iata, dest.state)),
    getNwsAlerts(origin.lat, origin.lon),
    getNwsAlerts(dest.lat, dest.lon),
  ]);

  const { data: events } = await supabaseAdmin
    .from("curated_events")
    .select("id,name,city,state,starts_on,ends_on,demand_class")
    .lte("starts_on", addDays(trip.travel_date, 2))
    .gte("ends_on", addDays(trip.travel_date, -1));

  const eventRows = (events ?? []) as CuratedEventRow[];
  const matchCity = (row: CuratedEventRow, airport: AirportRow) =>
    !row.city || (row.city === airport.city && (!row.state || row.state === airport.state));

  const drafts: SignalDraft[] = [];

  if (faa.data && faaRelevant) {
    drafts.push(
      ...faaSignals(faa.data, origin, "departure", faa.fetchedAt, trip.travel_date),
      ...faaSignals(faa.data, dest, "arrival", faa.fetchedAt, trip.travel_date),
    );
  }

  const rawDep = depTaf.data?.[0]?.rawTAF ?? depMetar.data?.[0]?.rawOb ?? "";
  const rawArr = arrTaf.data?.[0]?.rawTAF ?? arrMetar.data?.[0]?.rawOb ?? "";
  const depWx = rawDep && forecastRelevant
    ? tafSignal(rawDep, origin, "departure", depTaf.fetchedAt, trip.travel_date)
    : null;
  const arrWx = rawArr && forecastRelevant
    ? tafSignal(rawArr, dest, "arrival", arrTaf.fetchedAt, trip.travel_date)
    : null;
  if (depWx) drafts.push(depWx);
  if (arrWx) drafts.push(arrWx);

  if (depAlerts.data)
    drafts.push(
      ...nwsSignals(
        depAlerts.data,
        origin,
        "departure",
        depAlerts.fetchedAt,
        windows.depStart,
        windows.depEnd,
      ),
    );
  if (arrAlerts.data)
    drafts.push(
      ...nwsSignals(
        arrAlerts.data,
        dest,
        "arrival",
        arrAlerts.fetchedAt,
        windows.depStart,
        windows.arrEnd,
      ),
    );

  drafts.push(
    ...eventSignals(
      eventRows.filter((e) => matchCity(e, dest)),
      dest,
      "arrival",
      trip.travel_date,
      retrievedAt,
    ),
    ...eventSignals(
      eventRows.filter((e) => e.city && matchCity(e, origin)),
      origin,
      "departure",
      trip.travel_date,
      retrievedAt,
    ),
  );

  // Phase 2 seam: flight chain stays unavailable while the manual provider is active.
  const provider = getFlightProvider();
  const chainStatus = await provider.getStatus(trip.flight_label, trip.travel_date);
  drafts.push(chainStub(retrievedAt, trip.id));

  // Dedupe by fingerprint, highest severity wins.
  const byFingerprint = new Map<string, SignalDraft>();
  for (const draft of drafts) {
    const existing = byFingerprint.get(draft.fingerprint);
    if (!existing || draft.severity > existing.severity) byFingerprint.set(draft.fingerprint, draft);
  }
  const finalDrafts = [...byFingerprint.values()];

  const depSourcesOk = ok(faa) && (ok(depTaf) || ok(depMetar) || ok(depAlerts));
  const arrSourcesOk = ok(faa) && (ok(arrTaf) || ok(arrMetar) || ok(arrAlerts));
  const sourcesOk = depSourcesOk && arrSourcesOk;

  const unavailable: string[] = [];
  if (!ok(faa)) unavailable.push("FAA airport status");
  if (!ok(depTaf) && !ok(depMetar)) unavailable.push(`${origin.iata} aviation weather`);
  if (!ok(arrTaf) && !ok(arrMetar)) unavailable.push(`${dest.iata} aviation weather`);

  const status = overallStatus(finalDrafts, sourcesOk);
  const pressure = pressureIndex(finalDrafts.filter((d) => d.category !== "chain_status"));

  const { data: previous } = await supabaseAdmin
    .from("briefings")
    .select("id,status")
    .eq("trip_id", trip.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: briefing, error: briefErr } = await supabaseAdmin
    .from("briefings")
    .insert({
      trip_id: trip.id,
      status,
      pressure_index: pressure,
      headline: headlineFor(status, finalDrafts),
      why_summary: whySummary(finalDrafts, status),
      dep_card_status: cardStatus(
        finalDrafts.filter((d) => d.location === "departure"),
        depSourcesOk,
      ),
      arr_card_status: cardStatus(
        finalDrafts.filter((d) => d.location === "arrival"),
        arrSourcesOk,
      ),
      chain_card_status: chainStatus ? "clear" : "incomplete",
      generated_at: retrievedAt,
      source_freshness: {
        faa: faa.fetchedAt,
        awc_dep: depTaf.fetchedAt,
        awc_arr: arrTaf.fetchedAt,
        nws_dep: depAlerts.fetchedAt,
        nws_arr: arrAlerts.fetchedAt,
      },
      unavailable_categories: unavailable,
    })
    .select("id")
    .single();
  if (briefErr || !briefing) throw briefErr ?? new Error("Could not save briefing");

  if (finalDrafts.length > 0) {
    await supabaseAdmin.from("signals").insert(
      finalDrafts.map((d) => ({
        briefing_id: briefing.id,
        location: d.location === "chain" ? "flight_chain" : d.location,
        category: d.category,
        confidence: d.confidence,
        severity: d.severity,
        title: d.title,
        summary: d.summary,
        why_it_matters: d.why_it_matters,
        evidence: d.evidence as never,
        source: d.source,
        source_url: d.source_url ?? null,
        retrieved_at: d.retrieved_at,
        active_from: d.active_from ?? null,
        active_until: d.active_until ?? null,
        fingerprint: d.fingerprint,
      })),
    );
  }

  await recordChanges(trip.id, briefing.id, previous, status, finalDrafts);
}

function ok(result: SourceResult<unknown>): boolean {
  return result.ok && result.data !== null;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function whySummary(drafts: SignalDraft[], status: BriefStatus): string {
  if (status === "clear")
    return "Nothing material found for your window at the last check. Airport and weather conditions are rechecked as departure gets closer.";
  if (status === "incomplete")
    return "At least one required source did not respond, so Aircue cannot call this clear.";
  const top = drafts
    .filter((d) => d.category !== "chain_status" && d.severity >= 30)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map((d) => d.summary);
  return top.join(" ");
}

async function recordChanges(
  tripId: string,
  briefingId: string,
  previous: { id: string; status: string } | null,
  status: BriefStatus,
  drafts: SignalDraft[],
): Promise<void> {
  if (!previous) {
    await supabaseAdmin.from("change_events").insert({
      trip_id: tripId,
      briefing_id: briefingId,
      change_type: "watch_started",
      headline: "Brief created.",
      detail: headlineFor(status, drafts),
    });
    return;
  }

  const rank: Record<string, number> = {
    clear: 0,
    incomplete: 1,
    watch: 2,
    elevated: 3,
    disruption: 4,
  };
  const events: {
    trip_id: string;
    briefing_id: string;
    change_type: string;
    headline: string;
    detail?: string;
  }[] = [];

  if (rank[status]! > rank[previous.status]!) {
    events.push({
      trip_id: tripId,
      briefing_id: briefingId,
      change_type: "status_up",
      headline: `${label(status)}: ${headlineFor(status, drafts)}`,
    });
  } else if (rank[status]! < rank[previous.status]!) {
    events.push({
      trip_id: tripId,
      briefing_id: briefingId,
      change_type: "status_down",
      headline: `${label(status)}: conditions eased since the last check.`,
    });
  }

  const { data: prevSignals } = await supabaseAdmin
    .from("signals")
    .select("fingerprint,summary")
    .eq("briefing_id", previous.id);
  const before = new Set((prevSignals ?? []).map((s) => s.fingerprint));
  const after = new Set(drafts.map((d) => d.fingerprint));

  for (const draft of drafts) {
    if (draft.category === "chain_status" || draft.severity < 30) continue;
    if (!before.has(draft.fingerprint)) {
      events.push({
        trip_id: tripId,
        briefing_id: briefingId,
        change_type: "new_signal",
        headline: draft.summary,
      });
    }
  }
  for (const prev of prevSignals ?? []) {
    if (!after.has(prev.fingerprint) && !prev.fingerprint.startsWith("chain:")) {
      events.push({
        trip_id: tripId,
        briefing_id: briefingId,
        change_type: "resolved",
        headline: "Resolved: a condition from the last check is no longer active.",
      });
    }
  }

  if (events.length > 0) await supabaseAdmin.from("change_events").insert(events);
}

function label(status: BriefStatus): string {
  return {
    clear: "Clear",
    watch: "Watch",
    elevated: "Elevated",
    disruption: "Active disruption",
    incomplete: "Incomplete",
  }[status];
}

/* ------------------------------- view model ------------------------------- */

const CATEGORY_MAP: Record<string, SignalCategory> = {
  weather: "weather",
  airport_ops: "airport",
  faa_program: "faa",
  event: "event",
  holiday: "holiday",
  chain_status: "flight",
};

export async function buildBriefView(tripId: string): Promise<Brief | null> {
  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle<TripRow>();
  if (!trip) return null;

  const { data: airports } = await supabaseAdmin
    .from("airports")
    .select("iata,name,city,state,tz,lat,lon")
    .in("iata", [trip.origin_iata, trip.dest_iata]);
  const origin = (airports ?? []).find((a) => a.iata === trip.origin_iata) as AirportRow | undefined;
  const dest = (airports ?? []).find((a) => a.iata === trip.dest_iata) as AirportRow | undefined;
  if (!origin || !dest) return null;

  const { data: briefing } = await supabaseAdmin
    .from("briefings")
    .select("*")
    .eq("trip_id", trip.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!briefing) return null;

  const { data: signalRows } = await supabaseAdmin
    .from("signals")
    .select("*")
    .eq("briefing_id", briefing.id)
    .order("severity", { ascending: false });

  const { data: changes } = await supabaseAdmin
    .from("change_events")
    .select("id,occurred_at,headline")
    .eq("trip_id", trip.id)
    .order("occurred_at", { ascending: false })
    .limit(6);

  const { data: watch } = await supabaseAdmin
    .from("watches")
    .select("email,state,next_check_at")
    .eq("trip_id", trip.id)
    .eq("state", "active")
    .maybeSingle();

  const schedDep = new Date(trip.sched_dep_utc ?? briefing.generated_at);
  const schedArr = new Date(trip.sched_arr_utc ?? schedDep.getTime() + 2 * 3600000);

  const toSignal = (row: Record<string, unknown>): Signal => {
    const severity = Number(row["severity"]);
    const confidence = row["confidence"] as Confidence;
    const category = String(row["category"]);
    const loc = String(row["location"]);
    return {
      id: String(row["id"]),
      category: CATEGORY_MAP[category] ?? "airport",
      location: loc === "flight_chain" ? "chain" : (loc as SignalLocation),
      title: String(row["title"]),
      detail: String(row["summary"]),
      why: String(row["why_it_matters"]),
      confidence,
      level: levelFor({ severity, confidence, category }),
      source: String(row["source"]),
      updated: formatLocalTime(new Date(String(row["retrieved_at"])), origin.tz),
    };
  };

  const rows = (signalRows ?? []) as unknown as Record<string, unknown>[];
  const pick = (location: string) => rows.filter((r) => r["location"] === location).map(toSignal);

  const cardToStatus = (value: string): BriefStatus =>
    value === "active"
      ? "disruption"
      : value === "elevated"
        ? "elevated"
        : value === "incomplete"
          ? "incomplete"
          : "clear";

  const unavailable = (briefing.unavailable_categories ?? []) as string[];

  return {
    id: trip.id,
    flightNumber: trip.flight_label,
    origin: origin.iata,
    destination: dest.iata,
    originCity: origin.city ?? origin.iata,
    destinationCity: dest.city ?? dest.iata,
    date: formatLocalDate(schedDep, origin.tz),
    departsLocal: formatLocalTime(schedDep, origin.tz),
    arrivesLocal: formatLocalTime(schedArr, dest.tz),
    countdown: formatCountdown(schedDep),
    status: briefing.status as BriefStatus,
    pressure: briefing.pressure_index ?? 0,
    outlook: briefing.headline,
    impact: briefing.why_summary ?? "",
    generatedAt: formatChecked(new Date(briefing.generated_at), origin.tz),
    changes: (changes ?? []).map((c) => ({
      id: c.id,
      time: formatLocalTime(new Date(c.occurred_at), origin.tz),
      text: c.headline,
    })),
    departure: {
      label: "Departure",
      place: origin.city ?? origin.iata,
      code: origin.iata,
      status: cardToStatus(briefing.dep_card_status),
      summary: "",
      signals: pick("departure"),
      unavailable: unavailable.filter((u) => u.includes(origin.iata) || u.includes("FAA")),
    },
    arrival: {
      label: "Arrival",
      place: dest.city ?? dest.iata,
      code: dest.iata,
      status: cardToStatus(briefing.arr_card_status),
      summary: "",
      signals: pick("arrival"),
      unavailable: unavailable.filter((u) => u.includes(dest.iata)),
    },
    chain: {
      summary: "",
      status: cardToStatus(briefing.chain_card_status),
      signals: pick("flight_chain"),
    },
    ...(watch
      ? {
          watch: {
            active: true,
            nextCheck: watch.next_check_at
              ? formatLocalTime(new Date(watch.next_check_at), origin.tz)
              : "soon",
            cadence: "Checks get more frequent closer to departure",
            expires: "Watching stops after the trip",
            email: watch.email ?? "",
          },
        }
      : {}),
    ...(trip.share_token ? { shareToken: trip.share_token } : {}),
  };
}

/** Trip creation helper shared by the search form and the watch runner. */
export async function ensureTrip(input: {
  flightLabel: string;
  travelDate: string;
  origin: string;
  dest: string;
  depTime?: string | undefined;
  deviceId?: string | undefined;
}): Promise<string> {
  const { data: airports } = await supabaseAdmin
    .from("airports")
    .select("iata,tz,lat,lon")
    .in("iata", [input.origin, input.dest]);
  const origin = (airports ?? []).find((a) => a.iata === input.origin);
  const dest = (airports ?? []).find((a) => a.iata === input.dest);
  if (!origin || !dest) throw new Error("Unknown airport code");

  const km = distanceKm(
    { lat: Number(origin.lat), lon: Number(origin.lon) },
    { lat: Number(dest.lat), lon: Number(dest.lon) },
  );
  const w = buildWindows({
    travelDate: input.travelDate,
    depTime: input.depTime,
    originTz: origin.tz,
    distanceKm: km,
  });

  const { data: existing } = await supabaseAdmin
    .from("trips")
    .select("id")
    .eq("flight_label", input.flightLabel)
    .eq("travel_date", input.travelDate)
    .eq("origin_iata", input.origin)
    .eq("dest_iata", input.dest)
    .maybeSingle();
  if (existing) return existing.id;

  const carrier = input.flightLabel.replace(/[0-9].*$/, "") || "UA";
  const number = input.flightLabel.replace(/^[A-Za-z]+/, "");

  const { data: inserted, error } = await supabaseAdmin
    .from("trips")
    .insert({
      marketing_carrier: carrier,
      flight_number: number,
      flight_label: input.flightLabel,
      travel_date: input.travelDate,
      origin_iata: input.origin,
      dest_iata: input.dest,
      sched_dep_utc: w.schedDep.toISOString(),
      sched_arr_utc: w.schedArr.toISOString(),
      dep_window_start: w.depWindowStart.toISOString(),
      dep_window_end: w.depWindowEnd.toISOString(),
      arr_window_end: w.arrWindowEnd.toISOString(),
      flight_provider: "manual",
      share_token: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
      device_id: input.deviceId ?? null,
    })
    .select("id")
    .single();
  if (error || !inserted) throw error ?? new Error("Could not create trip");
  return inserted.id;
}
