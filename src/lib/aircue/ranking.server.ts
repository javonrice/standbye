/**
 * AirCue ranking engine.
 *
 * Turns a route + date into ranked standby setups. Four pillars — availability,
 * operations, history, recovery — feed an internal score. The score never
 * leaves this module: callers get a judgment label, pillar states and reasons.
 */
import { buildRouteBoard } from "@/lib/aircue/serpapi-flights.server";
import { findRouteLegs, findOriginDepartures, type RouteLeg } from "@/lib/aircue/route-search.server";
import { expandAirports, sameCity } from "@/lib/aircue/airport-groups";
import { airportGeo, localClockAt, milesBetween } from "@/lib/aircue/airport-lookup.server";
import { getFlightProvider } from "@/lib/aircue/flight-provider.server";
import { getRouteHistory } from "@/lib/aircue/history.server";
import { getFaaPrograms, getMetar, getTaf, icaoFor } from "@/lib/aircue/sources.server";
import { ALL_AIRLINES, airlineName } from "@/lib/aircue/airlines";
import type {
  AvailabilityEvidence,
  ConditionsEvidence,
  Confidence,
  HistoryEvidence,
  HolidayEvidence,
  Judgment,
  Pillar,
  PillarState,
  Reason,
  RecoveryEvidence,
  OptionSegment,
  GatewayOption,
  RoutingMode,
  Shot,
} from "@/lib/aircue/standby";

export interface RankInput {
  origin: string;
  dest: string;
  travelDate: string;
  carriers: string[] | null;
  travelers: number;
  cabin: string;
  userId: string;
  /** 0 = nonstop only, 1 = allow a single connection when nonstops are thin. */
  maxStops?: number;
  /** Include driveable nearby airports in the search. */
  nearby?: boolean;
  /** How wide the traveller wants the net cast. */
  routingMode?: RoutingMode;
}

/** Why a search came back with nothing, so the UI can say something honest. */
export type RankReason = "no_service" | "day_over" | "carrier_filter" | "data_unavailable";

export interface RankResult {
  options: RankedOption[];
  reason: RankReason | null;
  scanned: { origins: string[]; dests: string[] };
  gateways: GatewayOption[];
  nonstopCount: number;
}

export interface RankedOption {
  rank: number;
  kind: "nonstop" | "connection";
  /** Connecting city for a routing option. */
  hub?: string | null;
  judgment: Judgment;
  confidence: Confidence;
  score: number;
  headline: string;
  carrier: string | null;
  flightNumber: string | null;
  flightLabel: string;
  origin: string;
  dest: string;
  depLocal: string;
  arrLocal: string;
  schedDepUtc: string | null;
  schedArrUtc: string | null;
  segments: OptionSegment[];
  pillars: Pillar[];
  reasons: Reason[];
  recovery: RecoveryEvidence;
  evidence: {
    availability: AvailabilityEvidence;
    conditions: ConditionsEvidence | null;
    history: HistoryEvidence | null;
    holiday: HolidayEvidence | null;
  };
}

/* ------------------------------ small helpers ----------------------------- */

const PARTY_LEVELS = [1, 2, 4, 6, 9];

function hhmm(iso: string, fallback?: string): string {
  if (fallback) return to12h(fallback);
  const d = new Date(iso);
  return to12h(`${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`);
}

function to12h(raw: string): string {
  const [h = "0", m = "00"] = raw.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const stateScore: Record<PillarState, number> = { good: 30, fair: 16, poor: 0, unknown: 18 };

/* ------------------------------- availability ----------------------------- */

interface BoardEntry {
  bucket: string | null;
  largestN: number | null;
  /** Destination-local arrival time from the public booking board, when known. */
  arrLocal: string | null;
}

async function availabilityBoard(
  input: RankInput,
): Promise<{ map: Map<string, BoardEntry>; ok: boolean; checkedAt: string | null; reason?: string }> {
  const carrier =
    input.carriers && input.carriers.length === 1 ? (input.carriers[0] ?? null) : null;
  const board = await buildRouteBoard({
    origin: input.origin,
    dest: input.dest,
    date: input.travelDate,
    carrier,
    mode: "precise",
    deviceId: input.userId,
  });
  const map = new Map<string, BoardEntry>();
  for (const f of board.flights ?? []) {
    map.set(f.flightLabel.replace(/\s+/g, ""), {
      bucket: (f as { bucket?: string | null }).bucket ?? null,
      largestN: (f as { largestN?: number | null }).largestN ?? null,
      arrLocal: (f as { arrLocal?: string | null }).arrLocal || null,
    });
  }
  const result: { map: Map<string, BoardEntry>; ok: boolean; checkedAt: string | null; reason?: string } = {
    map,
    ok: Boolean(board.ok),
    checkedAt: board.ok ? new Date().toISOString() : null,
  };
  if (!board.ok && board.reason) result.reason = board.reason;
  return result;
}

function availabilityFor(entry: BoardEntry | undefined, ok: boolean, checkedAt: string | null, reason?: string) {
  if (!ok || !entry) {
    const ev: AvailabilityEvidence = {
      checked: false,
      tested: [],
      largestShowing: null,
      checkedAt,
      ...(reason ? { reason } : {}),
    };
    return {
      state: "unknown" as PillarState,
      label: "Not available",
      detail: "We could not get a useful booking availability signal. That is not the same as full.",
      evidence: ev,
    };
  }

  const largest = entry.largestN ?? (entry.bucket === "9+" ? 9 : entry.bucket === "0" ? 0 : null);
  const tested = PARTY_LEVELS.map((adults) => ({
    adults,
    showing: largest === null ? false : adults <= largest,
  }));
  const ev: AvailabilityEvidence = {
    checked: true,
    tested,
    largestShowing: largest,
    checkedAt,
  };

  if (largest === null) {
    return {
      state: "fair" as PillarState,
      label: "Limited",
      detail: "Booking is showing, but only for a small party.",
      evidence: ev,
    };
  }
  if (largest >= 9) {
    return {
      state: "good" as PillarState,
      label: "Strong",
      detail: "Booking availability is still showing for a larger party.",
      evidence: ev,
    };
  }
  if (largest >= 4) {
    return {
      state: "good" as PillarState,
      label: "Moderate",
      detail: `Booking is still showing for parties up to ${largest}.`,
      evidence: ev,
    };
  }
  if (largest >= 1) {
    return {
      state: "fair" as PillarState,
      label: "Tight",
      detail: `Booking only shows for parties up to ${largest}.`,
      evidence: ev,
    };
  }
  return {
    state: "poor" as PillarState,
    label: "Not selling",
    detail: "The airline is no longer selling this flight in public search.",
    evidence: ev,
  };
}

/* -------------------------------- operations ------------------------------ */

async function operationsFor(
  origin: string,
  dest: string,
  travelDate: string,
  depLocal: string,
): Promise<{ state: PillarState; label: string; detail: string; evidence: ConditionsEvidence }> {
  const [faa, metar, taf] = await Promise.all([
    getFaaPrograms(),
    getMetar(icaoFor(origin, null)),
    getTaf(icaoFor(origin, null)),
  ]);

  const programs = (faa.data ?? []).filter((p) => p.airport === origin || p.airport === dest);
  const stop = programs.find((p) => p.type === "ground_stop" || p.type === "closure");
  const delayProgram = programs.find((p) => p.type === "ground_delay" || p.type === "delay");

  const metarText = metar.data?.[0]
    ? ((metar.data[0] as { rawOb?: string; raw?: string }).rawOb ??
      (metar.data[0] as { raw?: string }).raw ??
      "Reported")
    : null;
  const tafText = taf.data?.[0]
    ? ((taf.data[0] as { rawTAF?: string; raw?: string }).rawTAF ??
      (taf.data[0] as { raw?: string }).raw ??
      null)
    : null;
  const stormy = /TS|SQ|FZRA|\+RA|BLSN/.test(tafText ?? "");

  let state: PillarState = "good";
  let label = "Normal";
  let detail = "No major disruption around this flight right now.";
  if (stop) {
    state = "poor";
    label = "Disrupted";
    detail = `${stop.airport} has an active ${stop.type.replace("_", " ")}.`;
  } else if (delayProgram) {
    state = "fair";
    label = "Some pressure";
    detail = `${delayProgram.airport} is running a delay program${delayProgram.average ? ` averaging ${delayProgram.average}` : ""}.`;
  } else if (stormy) {
    state = "fair";
    label = "Watch weather";
    detail = "The forecast shows conditions that can slow departures.";
  }

  const evidence: ConditionsEvidence = {
    airport: origin,
    faa: stop
      ? `Active ${stop.type.replace("_", " ")}`
      : delayProgram
        ? `Delay program in effect`
        : "No active ground stop",
    delays: delayProgram ? "Delays above normal" : "Delays currently near normal",
    weather: metarText ? metarText.slice(0, 90) : "No current observation",
    forecast: stormy ? "Convective weather in the forecast window" : tafText ? "Nothing unusual in the forecast" : null,
    forecastState: stormy ? "fair" : "good",
    note: stormy
      ? `Your ${depLocal} departure may sit near the higher-risk weather window.`
      : `Nothing in today's ${origin} operation is working against a ${depLocal} departure.`,
  };

  return { state, label, detail, evidence };
}

/* --------------------------------- history -------------------------------- */

async function historyFor(
  origin: string,
  dest: string,
  travelDate: string,
  localHour: number | null,
  carrier: string | null,
): Promise<{ state: PillarState; label: string; detail: string; evidence: HistoryEvidence | null }> {
  const history = await getRouteHistory({
    origin,
    dest,
    travelDate,
    localHour,
    ...(carrier ? { carrier } : {}),
  });
  if (!history) {
    return {
      state: "unknown",
      label: "No history",
      detail: "We do not have comparable historical data for this route yet.",
      evidence: null,
    };
  }

  const lf = history.load?.loadFactor ?? history.loadTypical?.loadFactor ?? null;
  const cancelRate = history.typical?.cancelRate ?? 0;
  const dep15 = history.typical?.dep15Rate ?? 0;

  let state: PillarState = "good";
  let label = "Typical";
  let detail = `${history.monthName} usually runs about normal on this route.`;
  if (lf !== null && lf >= 0.87) {
    state = "fair";
    label = "Tighter";
    detail = `${history.monthName} historically runs fuller than usual on this route.`;
  } else if (lf !== null && lf >= 0.93) {
    state = "poor";
    label = "Very tight";
    detail = `${history.monthName} historically runs very full on this route.`;
  }

  const evidence: HistoryEvidence = {
    monthLabel: history.monthName,
    carrierLabel: airlineName(history.carrier),
    summary: detail,
    loadIndex: lf === null ? null : Math.round(lf * 100),
    cancelPattern: cancelRate >= 0.03 ? "Elevated" : cancelRate >= 0.015 ? "Moderate" : "Low",
    delayPattern: dep15 >= 0.3 ? "Elevated" : dep15 >= 0.18 ? "Moderate" : "Low",
    sourcePeriod: history.load?.sourcePeriod ?? history.typical?.sourcePeriod ?? null,
  };

  return { state, label, detail, evidence };
}

/* --------------------------------- holiday -------------------------------- */

const TZ_COUNTRY: Record<string, string> = {
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Singapore": "SG",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Zurich": "CH",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Mexico_City": "MX",
  "Australia/Sydney": "AU",
};

const COUNTRY_FLAG: Record<string, string> = {
  JP: "🇯🇵", KR: "🇰🇷", CN: "🇨🇳", HK: "🇭🇰", SG: "🇸🇬", GB: "🇬🇧", FR: "🇫🇷",
  DE: "🇩🇪", ES: "🇪🇸", IT: "🇮🇹", NL: "🇳🇱", CH: "🇨🇭", CA: "🇨🇦", MX: "🇲🇽",
  AU: "🇦🇺", US: "🇺🇸",
};

async function holidayFor(destIata: string, travelDate: string): Promise<HolidayEvidence | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("airports")
      .select("tz,city,state")
      .eq("iata", destIata)
      .maybeSingle();
    const tz = (row as { tz?: string } | null)?.tz ?? "";
    const country = TZ_COUNTRY[tz] ?? (tz.startsWith("America/") ? "US" : null);
    if (!country) return null;

    const year = travelDate.slice(0, 4);
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const holidays = (await res.json()) as Array<{ date: string; name: string; localName: string }>;
    const target = new Date(`${travelDate}T00:00:00Z`).getTime();
    const near = holidays.find((h) => {
      const diff = Math.abs(new Date(`${h.date}T00:00:00Z`).getTime() - target) / 86400000;
      return diff <= 5;
    });
    if (!near) return null;
    return {
      country: `${COUNTRY_FLAG[country] ?? ""} ${country}`.trim(),
      name: near.localName || near.name,
      date: near.date,
      note: "Major holidays can make normal historical demand less useful. AirCue treats this as context, not proof the flight will be full.",
    };
  } catch {
    return null;
  }
}

/* -------------------------------- judgment -------------------------------- */

function judgeScore(score: number, availability: PillarState, recovery: PillarState): Judgment {
  if (availability === "poor" && recovery === "poor") return "riskier";
  if (score >= 76) return "favorable";
  if (score >= 52) return "mixed";
  return "riskier";
}

function confidenceFor(pillars: Pillar[], hasLoad: boolean): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  if (hasLoad && unknowns <= 1) return "high";
  if (unknowns >= 2) return "low";
  return "medium";
}

/* ------------------------------- entry point ------------------------------ */

type Board = Awaited<ReturnType<typeof availabilityBoard>>;

const EMPTY_BOARD: Board = { map: new Map(), ok: false, checkedAt: null };

/** Score one nonstop leg into a ranked option. */
async function scoreLeg(
  input: RankInput,
  leg: RouteLeg,
  siblings: RouteLeg[],
  board: Board,
  holiday: HolidayEvidence | null,
): Promise<RankedOption> {
  const provider = getFlightProvider();
  const carrier = leg.airlineCode ?? null;
  const digits = leg.flightNumber ?? null;
  const flightLabel = carrier && digits ? `${carrier}${digits}` : `${leg.origin}→${leg.dest}`;
  const depLocal = hhmm(leg.schedDepUtc, leg.depLocalTime);
  const boardEntry = board.map.get(flightLabel);
  // Schedule boards give us no arrival time, so only publish one when the
  // booking board actually reported it. A guessed arrival is worse than none.
  const arrLocal = await arrivalClock(leg, boardEntry?.arrLocal ?? null);
  const localHour = leg.depLocalTime ? Number(leg.depLocalTime.slice(0, 2)) : null;

  const availability = availabilityFor(
    boardEntry,
    board.ok,
    board.checkedAt,
    board.reason,
  );
  const [operations, history, cancels] = await Promise.all([
    operationsFor(leg.origin, leg.dest, input.travelDate, depLocal),
    historyFor(leg.origin, leg.dest, input.travelDate, localHour, carrier),
    carrier && leg.depLocalTime
      ? provider.getEarlierRouteCancellations(
          leg.origin,
          leg.dest,
          input.travelDate,
          carrier,
          leg.depLocalTime,
        )
      : Promise.resolve(null),
  ]);

  const later = siblings.filter(
    (l) => new Date(l.schedDepUtc).getTime() > new Date(leg.schedDepUtc).getTime(),
  );
  const recovery = buildRecovery(later, board);

  let opsState = operations.state;
  let opsDetail = operations.detail;
  if ((cancels?.cancelledFlights ?? 0) > 0) {
    opsState = "poor";
    opsDetail = `${cancels?.cancelledFlights} earlier ${leg.origin} → ${leg.dest} departure${(cancels?.cancelledFlights ?? 0) > 1 ? "s were" : " was"} cancelled today, which pushes displaced travellers onto later flights.`;
  } else if ((cancels?.delayedFlights ?? 0) >= 2) {
    opsState = opsState === "good" ? "fair" : opsState;
    opsDetail = `${cancels?.delayedFlights} earlier departures on this route are running late.`;
  }

  const pillars: Pillar[] = [
    { key: "availability", state: availability.state, label: availability.label, detail: availability.detail },
    { key: "operations", state: opsState, label: opsState === "good" ? "Normal" : operations.label, detail: opsDetail },
    { key: "history", state: history.state, label: history.label, detail: history.detail },
    { key: "recovery", state: recovery.state, label: recovery.label, detail: recovery.summary },
  ];

  const normalized = scoreOf(pillars);
  const judgment = judgeScore(normalized, availability.state, recovery.state);

  const segments: OptionSegment[] = [
    {
      carrier: carrier ?? "",
      flightNumber: digits ?? "",
      flightLabel,
      origin: leg.origin,
      dest: leg.dest,
      depLocal,
      arrLocal,
      schedDepUtc: leg.schedDepUtc,
    },
  ];

  return {
    rank: 0,
    kind: "nonstop",
    judgment,
    confidence: confidenceFor(pillars, false),
    score: normalized,
    headline: headlineFor(judgment, pillars),
    carrier,
    flightNumber: digits,
    flightLabel,
    origin: leg.origin,
    dest: leg.dest,
    depLocal,
    arrLocal,
    schedDepUtc: leg.schedDepUtc,
    schedArrUtc: leg.schedArrUtc,
    segments,
    pillars,
    reasons: reasonsOf(pillars),
    recovery,
    evidence: {
      availability: availability.evidence,
      conditions: operations.evidence,
      history: history.evidence,
      holiday,
    },
  };
}

function scoreOf(pillars: Pillar[]): number {
  const at = (key: string) => pillars.find((p) => p.key === key)?.state ?? "unknown";
  const raw =
    stateScore[at("availability")] * 1.2 +
    stateScore[at("operations")] * 1.0 +
    stateScore[at("recovery")] * 0.8 +
    stateScore[at("history")] * 0.4;
  return Math.round((raw / (30 * 3.4)) * 100);
}

function reasonsOf(pillars: Pillar[]): Reason[] {
  return pillars.map((p) => ({ key: p.key, state: p.state, title: reasonTitle(p), detail: p.detail }));
}

const worst = (a: PillarState, b: PillarState): PillarState => {
  const order: PillarState[] = ["poor", "fair", "unknown", "good"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
};

/* --------------------------- gateways / connections ------------------------ */

interface ConnectionCandidate {
  first: RouteLeg;
  second: RouteLeg;
  hub: string;
  layoverMinutes: number;
}

interface GatewayBuild {
  hub: string;
  city: string | null;
  /** First legs that actually connect to something onward. */
  inbound: RouteLeg[];
  onward: RouteLeg[];
  best: ConnectionCandidate;
  addedMinutes: number | null;
  caveat: string | null;
  state: PillarState;
  label: string;
  summary: string;
  recoveryState: PillarState;
  recoveryLabel: string;
}

const MIN_LAYOVER = 60;
const MAX_LAYOVER = 6 * 60;
/** Beyond this the routing stops being a sensible way to get there. */
const MAX_DETOUR_BEST = 1.45;
const MAX_DETOUR_WIDE = 1.8;
const BACKTRACK_HINT = 1.22;

const legLabel = (l: RouteLeg) =>
  l.airlineCode && l.flightNumber ? `${l.airlineCode}${l.flightNumber}` : `${l.origin}→${l.dest}`;

function shotJudgment(entry: BoardEntry | undefined): Judgment {
  const largest = entry?.largestN ?? (entry?.bucket === "9+" ? 9 : null);
  if (largest === null) return "mixed";
  if (largest >= 6) return "favorable";
  if (largest >= 1) return "mixed";
  return "riskier";
}

/**
 * Build the realistic gateways between this origin and destination.
 *
 * A gateway survives only when it has a usable way in, a usable way onward,
 * and does not force an absurd detour. Cost is capped by `maxHubs` because
 * every hub costs an extra schedule call.
 */
async function findGateways(
  input: RankInput,
  origins: string[],
  dests: string[],
  carrierFilter: string,
  allowed: Set<string> | null,
  maxHubs: number,
  wide: boolean,
): Promise<GatewayBuild[]> {
  const origin = origins[0];
  if (!origin || maxHubs <= 0) return [];

  const { legs: fromOrigin } = await findOriginDepartures(origin, input.travelDate, carrierFilter);
  const destSet = new Set(dests.map((d) => d.toUpperCase()));

  const byHub = new Map<string, RouteLeg[]>();
  for (const leg of fromOrigin) {
    if (allowed && leg.airlineCode && !allowed.has(leg.airlineCode)) continue;
    const hub = leg.dest.toUpperCase();
    if (destSet.has(hub) || sameCity(hub, origin) || sameCity(hub, input.dest)) continue;
    const list = byHub.get(hub) ?? [];
    list.push(leg);
    byHub.set(hub, list);
  }

  // Geography decides which hubs are even worth a schedule call.
  const geo = await airportGeo([origin, input.dest, ...byHub.keys()]);
  const from = geo.get(origin.toUpperCase());
  const to = geo.get(input.dest.toUpperCase());
  const direct = from && to ? milesBetween(from, to) : null;
  const maxDetour = wide ? MAX_DETOUR_WIDE : MAX_DETOUR_BEST;

  const ratioOf = (hub: string): number | null => {
    const h = geo.get(hub);
    if (!h || !from || !to || !direct || direct < 50) return null;
    return (milesBetween(from, h) + milesBetween(h, to)) / direct;
  };

  const ranked = [...byHub.entries()]
    .map(([hub, legs]) => ({ hub, legs, ratio: ratioOf(hub) }))
    .filter((h) => h.ratio === null || h.ratio <= maxDetour)
    .sort((a, b) => {
      const detour = (a.ratio ?? 1.2) - (b.ratio ?? 1.2);
      if (Math.abs(detour) > 0.15) return detour;
      return b.legs.length - a.legs.length;
    })
    .slice(0, maxHubs);

  const faa = await getFaaPrograms();
  const builds: GatewayBuild[] = [];

  for (const { hub, legs, ratio } of ranked) {
    let onward: RouteLeg[] = [];
    for (const dest of dests) {
      const { legs: found } = await findRouteLegs(hub, dest, input.travelDate, carrierFilter);
      onward = onward.concat(found.filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode)));
    }
    if (onward.length === 0) continue;
    onward.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));

    const pairs: ConnectionCandidate[] = [];
    const inbound: RouteLeg[] = [];
    for (const first of legs) {
      const arr = new Date(first.schedArrUtc).getTime();
      const second = onward.find((l) => {
        const gap = (new Date(l.schedDepUtc).getTime() - arr) / 60000;
        return gap >= MIN_LAYOVER && gap <= MAX_LAYOVER;
      });
      if (!second) continue;
      inbound.push(first);
      pairs.push({
        first,
        second,
        hub,
        layoverMinutes: Math.round((new Date(second.schedDepUtc).getTime() - arr) / 60000),
      });
    }
    if (pairs.length === 0) continue;

    pairs.sort((a, b) => a.first.schedDepUtc.localeCompare(b.first.schedDepUtc));
    inbound.sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
    const best = pairs[0]!;

    // Onward shots that remain useful after the earliest realistic arrival.
    const earliestArr = new Date(best.first.schedArrUtc).getTime();
    const usableOnward = onward.filter(
      (l) => (new Date(l.schedDepUtc).getTime() - earliestArr) / 60000 >= MIN_LAYOVER,
    );

    const programs = (faa.data ?? []).filter((p) => p.airport === hub);
    const stopped = programs.some((p) => p.type === "ground_stop" || p.type === "closure");
    const delayed = programs.some((p) => p.type === "ground_delay" || p.type === "delay");

    let state: PillarState;
    let label: string;
    if (stopped) {
      state = "poor";
      label = "Weak today";
    } else if (inbound.length >= 3 && usableOnward.length >= 4 && !delayed) {
      state = "good";
      label = "Strong alternate";
    } else if (inbound.length >= 2 && usableOnward.length >= 2) {
      state = "fair";
      label = "Good alternative";
    } else {
      state = "fair";
      label = "Possible";
    }

    let caveat: string | null = null;
    if (stopped) caveat = `Today's ${hub} operation is unstable.`;
    else if (delayed) caveat = `${hub} is running a delay program today.`;
    else if (ratio !== null && ratio >= BACKTRACK_HINT)
      caveat = "Plenty of onward options, but it means backtracking geographically.";

    const addedMinutes =
      direct !== null && ratio !== null ? Math.round((ratio - 1) * (direct / 480) * 60) : null;

    const city = geo.get(hub)?.city ?? null;
    builds.push({
      hub,
      city,
      inbound: inbound.slice(0, 6),
      onward: usableOnward,
      best,
      addedMinutes,
      caveat,
      state,
      label,
      summary: `${inbound.length} realistic shot${inbound.length === 1 ? "" : "s"} into ${city ?? hub}, ${usableOnward.length} useful flight${usableOnward.length === 1 ? "" : "s"} onward to ${input.dest}.`,
      recoveryState: usableOnward.length >= 4 ? "good" : usableOnward.length >= 2 ? "fair" : "poor",
      recoveryLabel:
        usableOnward.length >= 4 ? "Excellent" : usableOnward.length >= 2 ? "Good" : "Thin",
    });
  }

  const order: PillarState[] = ["good", "fair", "unknown", "poor"];
  builds.sort(
    (a, b) =>
      order.indexOf(a.state) - order.indexOf(b.state) ||
      b.onward.length - a.onward.length ||
      b.inbound.length - a.inbound.length,
  );
  return builds;
}

function gatewayOptionOf(build: GatewayBuild, boards: Map<string, Board>): GatewayOption {
  const inboundShots: Shot[] = build.inbound.map((l) => {
    const board = boards.get(`${l.origin}-${l.dest}`) ?? EMPTY_BOARD;
    return {
      flightLabel: legLabel(l),
      depLocal: hhmm(l.schedDepUtc, l.depLocalTime),
      judgment: shotJudgment(board.map.get(legLabel(l))),
    };
  });

  return {
    hub: build.hub,
    city: build.city,
    state: build.state,
    label: build.label,
    summary: build.summary,
    inboundShots,
    onwardDepartures: build.onward.slice(0, 8).map((l) => hhmm(l.schedDepUtc, l.depLocalTime)),
    onwardCount: build.onward.length,
    recoveryState: build.recoveryState,
    recoveryLabel: build.recoveryLabel,
    caveat: build.caveat,
    addedMinutes: build.addedMinutes,
  };
}

async function scoreConnection(
  input: RankInput,
  build: GatewayBuild,
  boards: Map<string, Board>,
  holiday: HolidayEvidence | null,
): Promise<RankedOption> {
  const { first, second, hub, layoverMinutes } = build.best;

  const firstBoard = boards.get(`${first.origin}-${first.dest}`) ?? EMPTY_BOARD;
  const secondBoard = boards.get(`${second.origin}-${second.dest}`) ?? EMPTY_BOARD;
  const a1 = availabilityFor(firstBoard.map.get(legLabel(first)), firstBoard.ok, firstBoard.checkedAt, firstBoard.reason);
  const a2 = availabilityFor(secondBoard.map.get(legLabel(second)), secondBoard.ok, secondBoard.checkedAt, secondBoard.reason);

  const depLocal = hhmm(first.schedDepUtc, first.depLocalTime);
  const [operations, history] = await Promise.all([
    operationsFor(first.origin, first.dest, input.travelDate, depLocal),
    historyFor(
      first.origin,
      second.dest,
      input.travelDate,
      first.depLocalTime ? Number(first.depLocalTime.slice(0, 2)) : null,
      first.airlineCode ?? null,
    ),
  ]);

  const availabilityState = worst(a1.state, a2.state);
  const place = build.city ?? hub;
  const recovery: RecoveryEvidence = {
    state: build.recoveryState,
    label: build.recoveryLabel,
    summary: `${build.inbound.length} way${build.inbound.length === 1 ? "" : "s"} into ${place} and ${build.onward.length} useful flight${build.onward.length === 1 ? "" : "s"} onward — but this routing needs two clears.`,
    hoursRemaining: null,
    laterNonstops: build.inbound.slice(1, 4).map((l) => ({
      flightLabel: legLabel(l),
      depLocal: hhmm(l.schedDepUtc, l.depLocalTime),
      judgment: shotJudgment(firstBoard.map.get(legLabel(l))),
    })),
    alternates: [],
  };

  const opsState = build.state === "poor" ? "poor" : operations.state;
  const pillars: Pillar[] = [
    {
      key: "availability",
      state: availabilityState,
      label: availabilityState === a1.state ? a1.label : a2.label,
      detail: `${a1.label} out of ${first.origin}, ${a2.label} out of ${hub}.`,
    },
    {
      key: "operations",
      state: opsState,
      label: opsState === "good" ? "Normal" : build.caveat ? "Watch the hub" : operations.label,
      detail: build.caveat ?? operations.detail,
    },
    { key: "history", state: history.state, label: history.label, detail: history.detail },
    { key: "recovery", state: recovery.state, label: recovery.label, detail: recovery.summary },
  ];

  // Failure domains: a connection needs two clears, so it starts behind an
  // otherwise equal nonstop and only wins on materially better recovery.
  const normalized = Math.max(0, scoreOf(pillars) - 12);
  const judgment = judgeScore(normalized, availabilityState, recovery.state);

  const segments: OptionSegment[] = [first, second].map((l) => ({
    carrier: l.airlineCode ?? "",
    flightNumber: l.flightNumber ?? "",
    flightLabel: legLabel(l),
    origin: l.origin,
    dest: l.dest,
    depLocal: hhmm(l.schedDepUtc, l.depLocalTime),
    arrLocal: "",
    schedDepUtc: l.schedDepUtc,
  }));

  return {
    rank: 0,
    kind: "connection",
    hub,
    judgment,
    confidence: "low",
    score: normalized,
    headline:
      build.recoveryState === "good"
        ? `${place} gives you more ways to recover, but it requires clearing two flights.`
        : `Gets you there through ${place} with a ${Math.floor(layoverMinutes / 60)}h ${layoverMinutes % 60}m connection — two clears, not one.`,
    carrier: first.airlineCode ?? null,
    flightNumber: null,
    flightLabel: `${first.origin} → ${hub} → ${second.dest}`,
    origin: first.origin,
    dest: second.dest,
    depLocal,
    arrLocal: "",
    schedDepUtc: first.schedDepUtc,
    schedArrUtc: second.schedArrUtc,
    segments,
    pillars,
    reasons: reasonsOf(pillars),
    recovery,
    evidence: {
      availability: a1.evidence,
      conditions: operations.evidence,
      history: history.evidence,
      holiday,
    },
  };
}

/* ------------------------------- entry point ------------------------------ */

export async function rankStandbyOptions(input: RankInput): Promise<RankResult> {
  const carrierFilter =
    input.carriers && input.carriers.length === 1 ? (input.carriers[0] ?? ALL_AIRLINES) : ALL_AIRLINES;
  const routingMode: RoutingMode = input.routingMode ?? "best";
  const wide = routingMode === "wide";
  const maxStops = routingMode === "nonstop" ? 0 : (input.maxStops ?? 1);
  const nearby = input.nearby ?? false;

  const origins = expandAirports(input.origin, nearby);
  const dests = expandAirports(input.dest, nearby);

  // Airport pairs to scan, primary pair first, capped to protect the flight-data budget.
  const pairs: Array<[string, string]> = [];
  for (const o of origins) for (const d of dests) if (o !== d) pairs.push([o, d]);
  const scanned = pairs.slice(0, 3);

  const holiday = await holidayFor(input.dest, input.travelDate);

  let anyBoardBlocked = false;
  let anyLegsBeforeCarrierFilter = 0;
  let anyLegsAtAll = 0;
  const allowed = input.carriers && input.carriers.length > 0 ? new Set(input.carriers) : null;

  const results: RankedOption[] = [];
  const boards = new Map<string, Board>();

  for (const [origin, dest] of scanned) {
    const [{ legs, budgetBlocked }, board] = await Promise.all([
      findRouteLegs(origin, dest, input.travelDate, carrierFilter),
      availabilityBoard({ ...input, origin, dest }),
    ]);
    boards.set(`${origin}-${dest}`, board);
    if (budgetBlocked) anyBoardBlocked = true;
    anyLegsBeforeCarrierFilter += legs.length;

    const usable = legs
      .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
      .sort((a, b) => new Date(a.schedDepUtc).getTime() - new Date(b.schedDepUtc).getTime())
      .slice(0, 12);
    anyLegsAtAll += usable.length;

    for (const leg of usable) {
      results.push(await scoreLeg(input, leg, usable, board, holiday));
    }
  }

  // Gateways are first-class now: we look for them whenever the traveller
  // allows a connection, not only when the nonstops run out.
  const nonstopCount = results.length;
  let gateways: GatewayOption[] = [];

  if (maxStops >= 1) {
    const maxHubs = wide ? 5 : nonstopCount === 0 ? 4 : 3;
    const builds = await findGateways(input, origins, dests, carrierFilter, allowed, maxHubs, wide);
    const scoreCount = wide ? 4 : nonstopCount === 0 ? 3 : 2;

    for (const build of builds.slice(0, scoreCount)) {
      for (const leg of [build.best.first, build.best.second]) {
        const key = `${leg.origin}-${leg.dest}`;
        if (!boards.has(key)) {
          boards.set(
            key,
            await availabilityBoard({ ...input, origin: leg.origin, dest: leg.dest }),
          );
        }
      }
      results.push(await scoreConnection(input, build, boards, holiday));
    }

    gateways = builds.map((b) => gatewayOptionOf(b, boards));

    // Nonstop recovery is network-aware: the strongest gateways are real backups.
    const alternates = builds.slice(0, 2).map((b) => ({
      routing: `Via ${b.hub}`,
      depLocal: hhmm(b.best.first.schedDepUtc, b.best.first.depLocalTime),
      judgment: (b.state === "good" ? "favorable" : b.state === "poor" ? "riskier" : "mixed") as Judgment,
      note: `${b.inbound.length} way${b.inbound.length === 1 ? "" : "s"} in, ${b.onward.length} onward — needs two clears.`,
      hub: b.hub,
    }));
    if (alternates.length > 0) {
      for (const option of results) {
        if (option.kind === "nonstop") option.recovery.alternates = alternates;
      }
    }
  }

  results.sort((a, b) => b.score - a.score || minutesOfDay(a.schedDepUtc ?? "") - minutesOfDay(b.schedDepUtc ?? ""));
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  let reason: RankReason | null = null;
  if (results.length === 0) {
    if (anyBoardBlocked) reason = "data_unavailable";
    else if (anyLegsBeforeCarrierFilter > 0 && anyLegsAtAll === 0) reason = "carrier_filter";
    else if (isLateInDay(input.travelDate)) reason = "day_over";
    else reason = "no_service";
  }

  return { options: results, reason, scanned: { origins, dests }, gateways, nonstopCount };
}

/** Rough "the useful part of the day is behind you" test, in the origin's rough local time. */
function isLateInDay(travelDate: string): boolean {
  const end = new Date(`${travelDate}T23:59:59Z`).getTime();
  const now = Date.now();
  return now < end && end - now < 8 * 3600000;
}

function reasonTitle(p: Pillar): string {
  if (p.key === "availability") return `${p.label} public availability`;
  if (p.key === "operations") return p.state === "good" ? "Operations look normal" : `Operations: ${p.label.toLowerCase()}`;
  if (p.key === "history") return p.state === "unknown" ? "No historical pattern yet" : `Historically ${p.label.toLowerCase()}`;
  return `${p.label} recovery room`;
}

function headlineFor(judgment: Judgment, pillars: Pillar[]): string {
  const availability = pillars.find((p) => p.key === "availability");
  const recovery = pillars.find((p) => p.key === "recovery");
  if (judgment === "favorable") return "Best balance of availability and backup options today.";
  if (judgment === "mixed") {
    if (recovery?.state !== "good") return "Reasonable availability, but thinner backup options.";
    return "Workable, with one meaningful tradeoff.";
  }
  if (availability?.state === "poor") return "Public availability has dried up on this one.";
  return "Every part of this setup is working against you a little.";
}

function buildRecovery(
  later: RouteLeg[],
  board: { map: Map<string, BoardEntry>; ok: boolean },
): RecoveryEvidence {
  const laterNonstops = later.slice(0, 3).map((l) => {
    const label = l.airlineCode && l.flightNumber ? `${l.airlineCode}${l.flightNumber}` : `${l.origin}→${l.dest}`;
    const entry = board.map.get(label);
    const largest = entry?.largestN ?? (entry?.bucket === "9+" ? 9 : null);
    const judgment: Judgment = largest === null ? "mixed" : largest >= 6 ? "favorable" : largest >= 1 ? "mixed" : "riskier";
    return { flightLabel: label, depLocal: hhmm(l.schedDepUtc, l.depLocalTime), judgment };
  });

  const lastDep = later.at(-1);
  const hoursRemaining = lastDep
    ? Math.max(0, Math.round((new Date(lastDep.schedDepUtc).getTime() - Date.now()) / 3600000))
    : 0;

  let state: PillarState = "poor";
  let label = "Poor";
  if (laterNonstops.length >= 2) {
    state = "good";
    label = "Good";
  } else if (laterNonstops.length === 1) {
    state = "fair";
    label = "Fair";
  }

  const summary =
    laterNonstops.length === 0
      ? "Nothing useful is left on this route after this departure."
      : `${laterNonstops.length} useful alternative${laterNonstops.length > 1 ? "s" : ""} remain after this one.`;

  return {
    state,
    label,
    summary,
    hoursRemaining,
    laterNonstops,
    alternates: [],
  };
}
