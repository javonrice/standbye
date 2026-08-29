/**
 * Standbye ranking engine.
 *
 * Turns a route + date into ranked standby setups. Four pillars — availability,
 * operations, history, recovery — feed an internal score. The score never
 * leaves this module: callers get a judgment label, pillar states and reasons.
 */
import { buildRouteBoard } from "@/lib/aircue/google-flights8.server";
import {
  findRouteLegs,
  findOriginDepartures,
  type RouteLeg,
} from "@/lib/aircue/route-search.server";
import { expandAirports, sameCity } from "@/lib/aircue/airport-groups";
import {
  airportGeo,
  airportMeta,
  airportTimezone,
  icaoForAirport,
  localClockAt,
  milesBetween,
} from "@/lib/aircue/airport-lookup.server";
import { getFlightProvider } from "@/lib/aircue/flight-provider.server";
import { getRouteHistory } from "@/lib/aircue/history.server";
import { getFaaPrograms, getMetar, getTaf } from "@/lib/aircue/sources.server";
import { ALL_AIRLINES, airlineName } from "@/lib/aircue/airlines";
import { buildOptionKey } from "@/lib/aircue/option-key";
import { localArrivalDayOffset } from "@/lib/aircue/local-day-offset";
import { isFaaCoverageCountry, type CoverageState } from "@/lib/aircue/coverage";
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
  CommercialFare,
  StaffEligibility,
  OperatorVerification,
} from "@/lib/aircue/standby";
import type { AccessType, AirlineAccessMeta } from "@/lib/aircue/travel-access";
import { accessTypeForCarrier } from "@/lib/aircue/travel-access";
import {
  applyAccessAwareScore,
  classifyHistoryLoadFactor,
  worstAccess,
} from "@/lib/aircue/access-scoring";
import { preVerifyEligibility } from "@/lib/aircue/staff-eligibility";
import {
  filterCandidatesByAccess,
  searchItineraryCandidates,
  type Gf8ItineraryCandidate,
} from "@/lib/aircue/gf8-itineraries.server";

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
  /** Earliest local departure time "HH:MM" — Escape's "choose another time". */
  depTime?: string;
  /** Immutable access meta snapshot for friction / segment typing. */
  accessMeta?: AirlineAccessMeta;
}

/** Why a search came back with nothing, so the UI can say something honest. */
export type RankReason = "no_service" | "day_over" | "carrier_filter" | "data_unavailable";

export interface RankResult {
  options: RankedOption[];
  reason: RankReason | null;
  scanned: { origins: string[]; dests: string[] };
  gateways: GatewayOption[];
  nonstopCount: number;
  /** True when any board/source was blocked, even if some options were returned. */
  incomplete: boolean;
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
  /** Deterministic itinerary identity (not display). */
  optionKey: string;
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
    arrivalDayOffset?: number | null;
  };
  /** Itinerary-level access (worst segment), provisional from marketing pre-verify. */
  access: AccessType | null;
  staffEligibility: StaffEligibility;
  operatorVerification: OperatorVerification;
  /** Segment count = clears required. */
  standbyClears: number;
  commercialFare: CommercialFare | null;
}

/* ------------------------------ small helpers ----------------------------- */

const PARTY_LEVELS = [1, 2, 3, 4];

/** A standby search answers with what it has rather than hanging the traveller. */
const SEARCH_BUDGET_MS = 20_000;
const LEG_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index] as T;
      out[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

function hhmm(iso: string, fallback?: string): string {
  if (fallback) return to12h(fallback);
  const d = new Date(iso);
  return to12h(
    `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
  );
}

function to12h(raw: string): string {
  const [h = "0", m = "00"] = raw.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${suffix}`;
}

/**
 * Destination-local arrival time, in order of trust: the public booking board,
 * then the carrier-reported arrival on a flight-status record (rendered in the
 * destination airport's own timezone). Never an estimate.
 */
async function arrivalClock(leg: RouteLeg, boardArrLocal: string | null): Promise<string> {
  if (boardArrLocal) return boardArrLocal;
  if (leg.arrLocalTime) return to12h(leg.arrLocalTime);
  if (leg.arrUtcKnown) return await localClockAt(leg.dest, leg.schedArrUtc);
  return "";
}

/** Local calendar-day offset for an O&D pair; null when either local date is unknown. */
async function dayOffsetForLeg(
  origin: string,
  dest: string,
  schedDep: string | null | undefined,
  schedArr: string | null | undefined,
): Promise<number | null> {
  const [depTz, arrTz] = await Promise.all([airportTimezone(origin), airportTimezone(dest)]);
  return localArrivalDayOffset({
    schedDep,
    schedArr,
    depTimeZone: depTz,
    arrTimeZone: arrTz,
  });
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
  mode: "quick" | "precise" = "precise",
): Promise<{
  map: Map<string, BoardEntry>;
  ok: boolean;
  checkedAt: string | null;
  reason?: string;
}> {
  const carrier =
    input.carriers && input.carriers.length === 1 ? (input.carriers[0] ?? null) : null;
  const board = await buildRouteBoard({
    origin: input.origin,
    dest: input.dest,
    date: input.travelDate,
    carrier,
    mode,
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
  const result: {
    map: Map<string, BoardEntry>;
    ok: boolean;
    checkedAt: string | null;
    reason?: string;
  } = {
    map,
    ok: Boolean(board.ok),
    checkedAt: board.ok ? new Date().toISOString() : null,
  };
  if (!board.ok && board.reason) result.reason = board.reason;
  return result;
}

function availabilityFor(
  entry: BoardEntry | undefined,
  ok: boolean,
  checkedAt: string | null,
  reason?: string,
) {
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
      detail:
        "We could not get a useful booking availability signal. That is not the same as full.",
      evidence: ev,
    };
  }

  const largest = entry.largestN ?? (entry.bucket === "9+" ? 4 : entry.bucket === "0" ? 0 : null);
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
  if (largest >= 4) {
    return {
      state: "good" as PillarState,
      label: "Strong",
      detail: "Booking availability is still showing freely for a larger party.",
      evidence: ev,
    };
  }
  if (largest >= 2) {
    return {
      state: "fair" as PillarState,
      label: "Narrowing",
      detail: `Booking only shows for parties up to ${largest}.`,
      evidence: ev,
    };
  }
  if (largest >= 1) {
    return {
      state: "fair" as PillarState,
      label: "Tight",
      detail: "Booking only shows for a single seat.",
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
  const [originMeta, destMeta, icao] = await Promise.all([
    airportMeta(origin),
    airportMeta(dest),
    icaoForAirport(origin),
  ]);
  const faaCovered =
    isFaaCoverageCountry(originMeta?.country) || isFaaCoverageCountry(destMeta?.country);

  const [faa, metar, taf] = await Promise.all([
    faaCovered ? getFaaPrograms() : Promise.resolve(null),
    icao ? getMetar(icao) : Promise.resolve(null),
    icao ? getTaf(icao) : Promise.resolve(null),
  ]);

  const programs = faa
    ? (faa.data ?? []).filter((p) => p.airport === origin || p.airport === dest)
    : [];
  const stop = programs.find((p) => p.type === "ground_stop" || p.type === "closure");
  const delayProgram = programs.find((p) => p.type === "ground_delay" || p.type === "delay");

  const metarText = metar?.data?.[0]
    ? ((metar.data![0] as { rawOb?: string; raw?: string }).rawOb ??
      (metar.data![0] as { raw?: string }).raw ??
      "Reported")
    : null;
  const tafText = taf?.data?.[0]
    ? ((taf.data![0] as { rawTAF?: string; raw?: string }).rawTAF ??
      (taf.data![0] as { raw?: string }).raw ??
      null)
    : null;
  const stormy = /TS|SQ|FZRA|\+RA|BLSN/.test(tafText ?? "");
  const weatherCoverage: CoverageState = metarText || tafText ? "available" : icao ? "unavailable" : "unknown";
  const faaCoverage: CoverageState = !faaCovered
    ? "not_covered"
    : !faa || faa.ok === false
      ? "unavailable"
      : "available";

  let state: PillarState = "unknown";
  let label = "Coverage limited";
  let detail = "Live airport disruption coverage unavailable for this region.";

  if (faaCovered) {
    state = "good";
    label = "Normal";
    detail = "No major disruption around this flight right now.";
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
    } else if (faaCoverage === "unavailable" && !metarText) {
      state = "unknown";
      label = "Ops unknown";
      detail = "Airport disruption feed was unavailable just now.";
    }
  } else if (stormy) {
    state = "fair";
    label = "Watch weather";
    detail =
      "Weather may slow departures. Live airport disruption coverage unavailable for this region.";
  } else if (metarText || tafText) {
    state = "unknown";
    label = "Weather checked";
    detail =
      "Weather checked. Live airport disruption coverage unavailable for this region.";
  }

  const evidence: ConditionsEvidence = {
    airport: origin,
    faa: !faaCovered
      ? "Live airport disruption coverage unavailable for this region"
      : stop
        ? `Active ${stop.type.replace("_", " ")}`
        : delayProgram
          ? `Delay program in effect`
          : faaCoverage === "unavailable"
            ? "Disruption feed unavailable"
            : "No active ground stop",
    delays: !faaCovered
      ? "FAA delay programs not applicable here"
      : delayProgram
        ? "Delays above normal"
        : "Delays currently near normal",
    weather: metarText ? metarText.slice(0, 90) : "No current observation",
    forecast: stormy
      ? "Convective weather in the forecast window"
      : tafText
        ? "Nothing unusual in the forecast"
        : null,
    forecastState: stormy ? "fair" : metarText || tafText ? "good" : "unknown",
    note: !faaCovered
      ? stormy
        ? `Weather near ${depLocal} may matter. Disruption feed not covered for this region.`
        : `Weather checked for ${origin}. Disruption feed not covered for this region.`
      : stormy
        ? `Your ${depLocal} departure may sit near the higher-risk weather window.`
        : `Nothing in today's ${origin} operation is working against a ${depLocal} departure.`,
    faaCoverage,
    weatherCoverage,
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
): Promise<{
  state: PillarState;
  label: string;
  detail: string;
  evidence: HistoryEvidence | null;
}> {
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
      label: "Historical pattern unavailable",
      detail: "Historical pattern unavailable for this route and date window.",
      evidence: null,
    };
  }

  const lf = history.load?.loadFactor ?? history.loadTypical?.loadFactor ?? null;
  const cancelRate = history.typical?.cancelRate ?? 0;
  const dep15 = history.typical?.dep15Rate ?? 0;

  const band = classifyHistoryLoadFactor(lf);
  let state: PillarState = band.state;
  let label = band.label;
  let detail = `${history.monthName} usually runs about normal on this route.`;
  if (band.detailSuffix === "very_full") {
    detail = `${history.monthName} historically runs very full on this route.`;
  } else if (band.detailSuffix === "fuller") {
    detail = `${history.monthName} historically runs fuller than usual on this route.`;
  }

  const evidence: HistoryEvidence = {
    monthLabel: history.monthName,
    carrierLabel: airlineName(history.carrier),
    summary: detail,
    loadIndex: lf === null ? null : Math.round(lf * 100),
    cancelPattern: cancelRate >= 0.03 ? "Elevated" : cancelRate >= 0.015 ? "Moderate" : "Low",
    delayPattern: dep15 >= 0.3 ? "Elevated" : dep15 >= 0.18 ? "Moderate" : "Low",
    sourcePeriod: history.load?.sourcePeriod ?? history.typical?.sourcePeriod ?? null,
    historyCoverage: "available",
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
  JP: "🇯🇵",
  KR: "🇰🇷",
  CN: "🇨🇳",
  HK: "🇭🇰",
  SG: "🇸🇬",
  GB: "🇬🇧",
  FR: "🇫🇷",
  DE: "🇩🇪",
  ES: "🇪🇸",
  IT: "🇮🇹",
  NL: "🇳🇱",
  CH: "🇨🇭",
  CA: "🇨🇦",
  MX: "🇲🇽",
  AU: "🇦🇺",
  US: "🇺🇸",
};

/** A hung holiday API must never hold the whole search before scoring starts. */
const HOLIDAY_TIMEOUT_MS = 2500;

interface NagerHoliday {
  date: string;
  name: string;
  localName: string;
}

/** Public holidays are static per country-year, so one fetch serves every search. */
const holidayCache = new Map<string, NagerHoliday[]>();

/** Lightweight instrumentation for the holiday lookup. */
export const holidayStats = { requests: 0, cacheHits: 0, timeouts: 0, failures: 0 };

/** Test-only: drop the holiday list cache. */
export function __resetHolidayCache(): void {
  holidayCache.clear();
}

/**
 * The published holiday list for a country-year. Returns null on any failure —
 * timeout, non-2xx, or unparseable body — so the caller degrades to no holiday
 * context rather than failing the search. Only successes are cached, so a
 * transient outage does not blank holidays for the life of the process.
 */
async function holidayList(country: string, year: string): Promise<NagerHoliday[] | null> {
  const key = `${country}:${year}`;
  const cached = holidayCache.get(key);
  if (cached) {
    holidayStats.cacheHits += 1;
    return cached;
  }

  holidayStats.requests += 1;
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(HOLIDAY_TIMEOUT_MS),
    });
    if (!res.ok) {
      holidayStats.failures += 1;
      return null;
    }
    const body = (await res.json()) as NagerHoliday[];
    if (!Array.isArray(body)) {
      holidayStats.failures += 1;
      return null;
    }
    holidayCache.set(key, body);
    return body;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "TimeoutError") holidayStats.timeouts += 1;
    else holidayStats.failures += 1;
    return null;
  }
}

export async function holidayFor(
  destIata: string,
  travelDate: string,
): Promise<HolidayEvidence | null> {
  try {
    // Timezone comes from the shared airport metadata cache, not its own query.
    const tz = (await airportMeta(destIata))?.tz ?? "";
    const country = TZ_COUNTRY[tz] ?? (tz.startsWith("America/") ? "US" : null);
    if (!country) return null;

    const year = travelDate.slice(0, 4);
    const holidays = await holidayList(country, year);
    if (!holidays) return null;
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
      note: "Major holidays can make normal historical demand less useful. Standbye treats this as context, not proof the flight will be full.",
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

function confidenceFor(
  pillars: Pillar[],
  hasLoad: boolean,
  staffEligibility: StaffEligibility = "uncertain",
): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  // Modest haircut while operator is unverified — never treat as ineligible.
  if (staffEligibility === "uncertain" && unknowns >= 1) return "low";
  if (hasLoad && unknowns <= 1 && staffEligibility === "eligible") return "high";
  if (hasLoad && unknowns <= 1) return "medium";
  if (unknowns >= 2) return "low";
  return staffEligibility === "uncertain" ? "medium" : "medium";
}

function scoreOf(
  pillars: Pillar[],
  access: AccessType | null = null,
  standbyClears = 1,
): number {
  const at = (key: string) => pillars.find((p) => p.key === key)?.state ?? "unknown";
  const raw =
    stateScore[at("availability")] * 1.2 +
    stateScore[at("operations")] * 1.0 +
    stateScore[at("recovery")] * 0.8 +
    stateScore[at("history")] * 0.4;
  const base = Math.round((raw / (30 * 3.4)) * 100);
  return applyAccessAwareScore(base, access, standbyClears);
}

function attachAccess(
  input: RankInput,
  carrier: string | null | undefined,
): AccessType | null {
  if (!input.accessMeta) return null;
  return accessTypeForCarrier(input.accessMeta, carrier);
}

/* ---------------------------- score helpers board ------------------------- */

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

  const availability = availabilityFor(boardEntry, board.ok, board.checkedAt, board.reason);
  const [operations, history, cancels, arrivalDayOffset] = await Promise.all([
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
    dayOffsetForLeg(leg.origin, leg.dest, leg.schedDepUtc, leg.schedArrUtc),
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
    {
      key: "availability",
      state: availability.state,
      label: availability.label,
      detail: availability.detail,
    },
    {
      key: "operations",
      state: opsState,
      label: opsState === "good" ? "Normal" : operations.label,
      detail: opsDetail,
    },
    { key: "history", state: history.state, label: history.label, detail: history.detail },
    { key: "recovery", state: recovery.state, label: recovery.label, detail: recovery.summary },
  ];

  const access = attachAccess(input, carrier);
  const standbyClears = 1;
  const { staffEligibility, operatorVerification } = preVerifyEligibility();
  const normalized = scoreOf(pillars, access, standbyClears);
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
      schedArrUtc: leg.schedArrUtc,
      arrivalDayOffset,
      access,
    },
  ];

  return {
    rank: 0,
    kind: "nonstop",
    judgment,
    confidence: confidenceFor(pillars, false, staffEligibility),
    score: normalized,
    headline: headlineFor(judgment, pillars),
    carrier,
    flightNumber: digits,
    flightLabel,
    optionKey: buildOptionKey(segments),
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
      arrivalDayOffset,
    },
    access,
    staffEligibility,
    operatorVerification,
    standbyClears,
    commercialFare: null,
  };
}

function reasonsOf(pillars: Pillar[]): Reason[] {
  return pillars.map((p) => ({
    key: p.key,
    state: p.state,
    title: reasonTitle(p),
    detail: p.detail,
  }));
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
  const largest = entry?.largestN ?? (entry?.bucket === "9+" ? 4 : null);
  if (largest === null) return "mixed";
  if (largest >= 4) return "favorable";
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
  opts: { maxHubs: number; wide: boolean; maxDetour?: number },
): Promise<GatewayBuild[]> {
  const { maxHubs, wide } = opts;
  const origin = origins[0];
  if (!origin || maxHubs <= 0) return [];

  const { legs: fromOrigin } = await findOriginDepartures(
    origin,
    input.travelDate,
    carrierFilter,
    input.depTime,
  );
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
  const maxDetour = opts.maxDetour ?? (wide ? MAX_DETOUR_WIDE : MAX_DETOUR_BEST);

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
      onward = onward.concat(
        found.filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode)),
      );
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
  const a1 = availabilityFor(
    firstBoard.map.get(legLabel(first)),
    firstBoard.ok,
    firstBoard.checkedAt,
    firstBoard.reason,
  );
  const a2 = availabilityFor(
    secondBoard.map.get(legLabel(second)),
    secondBoard.ok,
    secondBoard.checkedAt,
    secondBoard.reason,
  );

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

  const segments: OptionSegment[] = await Promise.all(
    [first, second].map(async (l) => {
      const legBoard = boards.get(`${l.origin}-${l.dest}`) ?? EMPTY_BOARD;
      const segAccess = attachAccess(input, l.airlineCode);
      const segOffset = await dayOffsetForLeg(l.origin, l.dest, l.schedDepUtc, l.schedArrUtc);
      return {
        carrier: l.airlineCode ?? "",
        flightNumber: l.flightNumber ?? "",
        flightLabel: legLabel(l),
        origin: l.origin,
        dest: l.dest,
        depLocal: hhmm(l.schedDepUtc, l.depLocalTime),
        arrLocal: await arrivalClock(l, legBoard.map.get(legLabel(l))?.arrLocal ?? null),
        schedDepUtc: l.schedDepUtc,
        schedArrUtc: l.schedArrUtc,
        arrivalDayOffset: segOffset,
        access: segAccess,
      };
    }),
  );

  const access = worstAccess(segments.map((s) => s.access));
  const standbyClears = segments.length;
  const { staffEligibility, operatorVerification } = preVerifyEligibility();
  // Clears-aware soft friction replaces the former flat connection −12.
  const normalized = scoreOf(pillars, access, standbyClears);
  const judgment = judgeScore(normalized, availabilityState, recovery.state);
  const arrivalDayOffset = await dayOffsetForLeg(
    first.origin,
    second.dest,
    first.schedDepUtc,
    second.schedArrUtc,
  );

  return {
    rank: 0,
    kind: "connection",
    hub,
    judgment,
    confidence: confidenceFor(pillars, false, staffEligibility),
    score: normalized,
    headline:
      build.recoveryState === "good"
        ? `${place} gives you more ways to recover, but it requires clearing two flights.`
        : `Gets you there through ${place} with a ${Math.floor(layoverMinutes / 60)}h ${layoverMinutes % 60}m connection — two clears, not one.`,
    carrier: first.airlineCode ?? null,
    flightNumber: null,
    flightLabel: `${first.origin} → ${hub} → ${second.dest}`,
    optionKey: buildOptionKey(segments),
    origin: first.origin,
    dest: second.dest,
    depLocal,
    arrLocal: segments[1]?.arrLocal ?? "",
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
      arrivalDayOffset,
    },
    access,
    staffEligibility,
    operatorVerification,
    standbyClears,
    commercialFare: null,
  };
}

/* ------------------------------- GF8 merge -------------------------------- */

/**
 * Score a GF8 multi-segment (or nonstop) itinerary after access filter.
 * Pre-verify: uncertain + unverified. Incomplete times already rejected upstream.
 */
async function scoreGf8Candidate(
  input: RankInput,
  candidate: Gf8ItineraryCandidate,
  board: Board,
  holiday: HolidayEvidence | null,
): Promise<RankedOption> {
  const first = candidate.segments[0]!;
  const last = candidate.segments[candidate.segments.length - 1]!;
  const boardEntry =
    candidate.kind === "nonstop" ? board.map.get(first.flightLabel.replace(/\s+/g, "")) : undefined;

  const availability = availabilityFor(boardEntry, board.ok, board.checkedAt, board.reason);
  const localHourMatch = first.depLocal.match(/(\d{1,2}):/);
  const localHour = localHourMatch ? Number(localHourMatch[1]) % 24 : null;

  const [operations, history] = await Promise.all([
    operationsFor(first.origin, last.dest, input.travelDate, first.depLocal),
    historyFor(first.origin, last.dest, input.travelDate, localHour, first.carrier),
  ]);

  const standbyClears = candidate.standbyClears;
  const recovery: RecoveryEvidence =
    standbyClears <= 1
      ? {
          state: "fair",
          label: "Fair",
          summary: "Later nonstops on this board were not attached for this GF8 candidate.",
          hoursRemaining: null,
          laterNonstops: [],
          alternates: [],
        }
      : {
          state: "fair",
          label: "Fair",
          summary: `This routing needs ${standbyClears} clears across ${candidate.segments.length} segments.`,
          hoursRemaining: null,
          laterNonstops: [],
          alternates: [],
        };

  const pillars: Pillar[] = [
    {
      key: "availability",
      state: availability.state,
      label: availability.label,
      detail: availability.detail,
    },
    {
      key: "operations",
      state: operations.state,
      label: operations.state === "good" ? "Normal" : operations.label,
      detail: operations.detail,
    },
    { key: "history", state: history.state, label: history.label, detail: history.detail },
    { key: "recovery", state: recovery.state, label: recovery.label, detail: recovery.summary },
  ];

  const segments: OptionSegment[] = await Promise.all(
    candidate.segments.map(async (s) => {
      const schedDep = s.schedDepUtc || `${input.travelDate}T00:00:00Z`;
      const schedArr = s.schedArrUtc || null;
      const arrivalDayOffset = await dayOffsetForLeg(s.origin, s.dest, schedDep, schedArr);
      return {
        carrier: s.carrier,
        flightNumber: s.flightNumber,
        flightLabel: s.flightLabel,
        origin: s.origin,
        dest: s.dest,
        depLocal: s.depLocal,
        arrLocal: s.arrLocal,
        schedDepUtc: schedDep,
        schedArrUtc: schedArr,
        arrivalDayOffset,
        access: attachAccess(input, s.carrier),
      };
    }),
  );

  const access = worstAccess(segments.map((s) => s.access));
  const { staffEligibility, operatorVerification } = preVerifyEligibility();
  const normalized = scoreOf(pillars, access, standbyClears);
  const judgment = judgeScore(normalized, availability.state, recovery.state);
  const arrivalDayOffset = await dayOffsetForLeg(
    candidate.origin,
    candidate.dest,
    candidate.schedDepUtc,
    candidate.schedArrUtc,
  );

  return {
    rank: 0,
    kind: candidate.kind,
    hub: candidate.hub,
    judgment,
    confidence: confidenceFor(pillars, false, staffEligibility),
    score: normalized,
    headline: headlineFor(judgment, pillars),
    carrier: first.carrier,
    flightNumber: candidate.kind === "nonstop" ? first.flightNumber : null,
    flightLabel: candidate.flightLabel,
    optionKey: candidate.optionKey,
    origin: candidate.origin,
    dest: candidate.dest,
    depLocal: candidate.depLocal,
    arrLocal: candidate.arrLocal,
    schedDepUtc: candidate.schedDepUtc,
    schedArrUtc: candidate.schedArrUtc,
    segments,
    pillars,
    reasons: reasonsOf(pillars),
    recovery,
    evidence: {
      availability: availability.evidence,
      conditions: operations.evidence,
      history: history.evidence,
      holiday,
      arrivalDayOffset,
    },
    access,
    staffEligibility,
    operatorVerification,
    standbyClears,
    commercialFare: candidate.commercialFare,
  };
}

/** Merge schedule/gateway options with GF8 candidates by option_key. */
function mergeByOptionKey(existing: RankedOption[], gf8Options: RankedOption[]): RankedOption[] {
  const byKey = new Map<string, RankedOption>();
  for (const opt of existing) {
    byKey.set(opt.optionKey, opt);
  }
  for (const opt of gf8Options) {
    const prior = byKey.get(opt.optionKey);
    if (!prior) {
      byKey.set(opt.optionKey, opt);
      continue;
    }
    // Prefer board-backed availability; retain GF8 fare metadata when present.
    if (opt.commercialFare && !prior.commercialFare) {
      prior.commercialFare = opt.commercialFare;
    }
    if (prior.access == null && opt.access != null) prior.access = opt.access;
    for (let i = 0; i < prior.segments.length; i++) {
      const seg = prior.segments[i];
      const other = opt.segments[i];
      if (seg && other && seg.access == null && other.access != null) {
        seg.access = other.access;
      }
    }
  }
  return [...byKey.values()];
}

/* ------------------------------- entry point ------------------------------ */

export async function rankStandbyOptions(input: RankInput): Promise<RankResult> {
  const carrierFilter =
    input.carriers && input.carriers.length === 1
      ? (input.carriers[0] ?? ALL_AIRLINES)
      : ALL_AIRLINES;
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

  // Hard deadline: a standby search must answer with what it has, not hang.
  const deadline = Date.now() + SEARCH_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline;

  for (const [origin, dest] of scanned) {
    if (outOfTime() && results.length > 0) break;
    // Only the primary pair earns the precise seat ladder; extra pairs use the
    // cheap 9-then-1 probe, which still buckets 9+ / 1-8 / 0.
    const isPrimary = origin === input.origin && dest === input.dest;
    const [{ legs, budgetBlocked }, board] = await Promise.all([
      findRouteLegs(origin, dest, input.travelDate, carrierFilter),
      availabilityBoard({ ...input, origin, dest }, isPrimary ? "precise" : "quick"),
    ]);
    boards.set(`${origin}-${dest}`, board);
    if (budgetBlocked) anyBoardBlocked = true;
    anyLegsBeforeCarrierFilter += legs.length;

    const usable = legs
      .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
      .sort((a, b) => new Date(a.schedDepUtc).getTime() - new Date(b.schedDepUtc).getTime())
      .slice(0, 12);
    anyLegsAtAll += usable.length;

    const scored = await mapWithConcurrency(usable, LEG_CONCURRENCY, (leg) =>
      scoreLeg(input, leg, usable, board, holiday),
    );
    results.push(...scored);
  }

  // Gateways are first-class now: we look for them whenever the traveller
  // allows a connection, not only when the nonstops run out.
  const nonstopCount = results.length;
  let gateways: GatewayOption[] = [];

  if (maxStops >= 1 && !(outOfTime() && results.length > 0)) {
    const maxHubs = wide ? 5 : nonstopCount === 0 ? 4 : 3;
    const builds = await findGateways(input, origins, dests, carrierFilter, allowed, {
      maxHubs,
      wide,
    });
    const scoreCount = wide ? 4 : nonstopCount === 0 ? 3 : 2;

    for (const build of builds.slice(0, scoreCount)) {
      if (outOfTime() && results.length > 0) break;
      const legsNeeded = [build.best.first, build.best.second].filter(
        (leg) => !boards.has(`${leg.origin}-${leg.dest}`),
      );
      // Connection legs always use the cheap probe — two clears already limit
      // how much precision is worth paying for.
      const fetched = await Promise.all(
        legsNeeded.map((leg) =>
          availabilityBoard({ ...input, origin: leg.origin, dest: leg.dest }, "quick"),
        ),
      );
      legsNeeded.forEach((leg, i) => {
        const board = fetched[i];
        if (board) boards.set(`${leg.origin}-${leg.dest}`, board);
      });
      results.push(await scoreConnection(input, build, boards, holiday));
    }

    gateways = builds.map((b) => gatewayOptionOf(b, boards));

    // Nonstop recovery is network-aware: the strongest gateways are real backups.
    const alternates = builds.slice(0, 2).map((b) => ({
      routing: `Via ${b.hub}`,
      depLocal: hhmm(b.best.first.schedDepUtc, b.best.first.depLocalTime),
      judgment: (b.state === "good"
        ? "favorable"
        : b.state === "poor"
          ? "riskier"
          : "mixed") as Judgment,
      note: `${b.inbound.length} way${b.inbound.length === 1 ? "" : "s"} in, ${b.onward.length} onward — needs two clears.`,
      hub: b.hub,
    }));
    if (alternates.length > 0) {
      for (const option of results) {
        if (option.kind === "nonstop") option.recovery.alternates = alternates;
      }
    }
  }

  // One broad GF8 discovery; local access filter; merge by option_key.
  // Do not fan out per carrier. Incomplete GF8 must not blank schedule results.
  if (!(outOfTime() && results.length > 0)) {
    const primaryBoard = boards.get(`${input.origin}-${input.dest}`) ?? EMPTY_BOARD;
    const gf8 = await searchItineraryCandidates({
      origin: input.origin,
      dest: input.dest,
      date: input.travelDate,
      adults: Math.min(4, Math.max(1, input.travelers)),
    });
    if (gf8.ok && gf8.candidates.length > 0) {
      const allowedList = input.carriers && input.carriers.length > 0 ? input.carriers : [];
      const filtered = filterCandidatesByAccess(gf8.candidates, allowedList);
      const connectionOk = maxStops >= 1;
      const usable = filtered.filter((c) => connectionOk || c.kind === "nonstop");
      const scoredGf8 = await mapWithConcurrency(
        usable.slice(0, wide ? 12 : 8),
        LEG_CONCURRENCY,
        (cand) => scoreGf8Candidate(input, cand, primaryBoard, holiday),
      );
      const merged = mergeByOptionKey(results, scoredGf8);
      results.length = 0;
      results.push(...merged);
    }
  }

  // Ineligible (post-verify) stays out of preferred staff-travel ranking.
  const preferred = results.filter((o) => o.staffEligibility !== "ineligible");
  const rankedPool = preferred.length > 0 ? preferred : results;

  rankedPool.sort(
    (a, b) =>
      b.score - a.score || minutesOfDay(a.schedDepUtc ?? "") - minutesOfDay(b.schedDepUtc ?? ""),
  );
  rankedPool.forEach((r, i) => {
    r.rank = i + 1;
  });

  let reason: RankReason | null = null;
  if (rankedPool.length === 0) {
    if (anyBoardBlocked) reason = "data_unavailable";
    else if (anyLegsBeforeCarrierFilter > 0 && anyLegsAtAll === 0) reason = "carrier_filter";
    else if (isLateInDay(input.travelDate)) reason = "day_over";
    else reason = "no_service";
  }

  return {
    options: rankedPool,
    reason,
    scanned: { origins, dests },
    gateways,
    nonstopCount,
    incomplete: anyBoardBlocked,
  };
}

/** Rough "the useful part of the day is behind you" test, in the origin's rough local time. */
function isLateInDay(travelDate: string): boolean {
  const end = new Date(`${travelDate}T23:59:59Z`).getTime();
  const now = Date.now();
  return now < end && end - now < 8 * 3600000;
}

function reasonTitle(p: Pillar): string {
  if (p.key === "availability") return `${p.label} public availability`;
  if (p.key === "operations")
    return p.state === "good" ? "Operations look normal" : `Operations: ${p.label.toLowerCase()}`;
  if (p.key === "history")
    return p.state === "unknown"
      ? "Historical pattern unavailable"
      : `Historically ${p.label.toLowerCase()}`;
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
    const label =
      l.airlineCode && l.flightNumber
        ? `${l.airlineCode}${l.flightNumber}`
        : `${l.origin}→${l.dest}`;
    const entry = board.map.get(label);
    const largest = entry?.largestN ?? (entry?.bucket === "9+" ? 4 : null);
    const judgment: Judgment =
      largest === null ? "mixed" : largest >= 4 ? "favorable" : largest >= 1 ? "mixed" : "riskier";
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

/* --------------------------------- escape --------------------------------- */

/**
 * Escape is the "I'm stuck, find me another way" search. It considers ANY
 * reachable intermediate airport with a connectable same-day onward flight —
 * not just hubs — with a much wider candidate net and detour tolerance than
 * normal planning. One connection maximum.
 */
const ESCAPE_BUDGET_MS = 30_000;
const ESCAPE_MAX_HUBS = 10;
const ESCAPE_DETOUR = 2.0;
const ESCAPE_SCORE_COUNT = 6;

export interface EscapeResult {
  options: RankedOption[];
  gateways: GatewayOption[];
  nonstopCount: number;
  reason: RankReason | null;
}

export async function rankEscapeRoutes(input: RankInput): Promise<EscapeResult> {
  const carrierFilter =
    input.carriers && input.carriers.length === 1
      ? (input.carriers[0] ?? ALL_AIRLINES)
      : ALL_AIRLINES;
  const allowed = input.carriers && input.carriers.length > 0 ? new Set(input.carriers) : null;

  // City groups still count as the same place; driveable alternates do not —
  // someone who is stuck wants ways out of where they are.
  const origins = expandAirports(input.origin, false);
  const dests = expandAirports(input.dest, false);

  const holiday = await holidayFor(input.dest, input.travelDate);
  const deadline = Date.now() + ESCAPE_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline;

  const nonstops: RankedOption[] = [];
  const boards = new Map<string, Board>();
  let anyLegs = 0;
  let anyBlocked = false;

  // Nonstops are not escape routes — they are fetched for context (recovery
  // room, later shots, and the "still considering nonstop?" footnote) and are
  // ranked strictly below every alternate routing.
  for (const origin of origins) {
    for (const dest of dests) {
      if (origin === dest || outOfTime()) continue;
      const [{ legs, budgetBlocked }, board] = await Promise.all([
        findRouteLegs(origin, dest, input.travelDate, carrierFilter, input.depTime),
        availabilityBoard({ ...input, origin, dest }, "quick"),
      ]);
      boards.set(`${origin}-${dest}`, board);
      if (budgetBlocked) anyBlocked = true;
      anyLegs += legs.length;
      const usable = legs
        .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
        .slice(0, 6);
      const scored = await mapWithConcurrency(usable, LEG_CONCURRENCY, (leg) =>
        scoreLeg(input, leg, usable, board, holiday),
      );
      nonstops.push(...scored);
    }
  }
  const nonstopCount = nonstops.length;

  const builds = await findGateways(input, origins, dests, carrierFilter, allowed, {
    maxHubs: ESCAPE_MAX_HUBS,
    wide: true,
    maxDetour: ESCAPE_DETOUR,
  });

  const connections: Array<{ option: RankedOption; escapeScore: number }> = [];
  for (const build of builds.slice(0, ESCAPE_SCORE_COUNT)) {
    if (outOfTime()) break;
    const legsNeeded = [build.best.first, build.best.second].filter(
      (leg) => !boards.has(`${leg.origin}-${leg.dest}`),
    );
    const fetched = await Promise.all(
      legsNeeded.map((leg) =>
        availabilityBoard({ ...input, origin: leg.origin, dest: leg.dest }, "quick"),
      ),
    );
    legsNeeded.forEach((leg, i) => {
      const board = fetched[i];
      if (board) boards.set(`${leg.origin}-${leg.dest}`, board);
    });
    const option = await scoreConnection(input, build, boards, holiday);
    const gateway = gatewayOptionOf(build, boards);
    connections.push({ option, escapeScore: escapeScoreOf(option, gateway) });
  }

  const gateways = builds.map((b) => gatewayOptionOf(b, boards));

  connections.sort(
    (a, b) =>
      b.escapeScore - a.escapeScore ||
      minutesOfDay(a.option.schedDepUtc ?? "") - minutesOfDay(b.option.schedDepUtc ?? ""),
  );
  nonstops.sort(
    (a, b) =>
      b.score - a.score || minutesOfDay(a.schedDepUtc ?? "") - minutesOfDay(b.schedDepUtc ?? ""),
  );

  const results: RankedOption[] = [...connections.map((c) => c.option), ...nonstops];
  results.forEach((r, i) => {
    r.rank = i + 1;
  });


  let reason: RankReason | null = null;
  if (results.length === 0 && gateways.length === 0) {
    if (anyBlocked) reason = "data_unavailable";
    else if (anyLegs > 0 && allowed) reason = "carrier_filter";
    else if (isLateInDay(input.travelDate)) reason = "day_over";
    else reason = "no_service";
  }

  return { options: results, gateways, nonstopCount, reason };
}

/**
 * Escape's ranking objective is different from normal planning: what matters
 * most is whether the traveller can actually leave the airport they are stuck
 * at, and whether several ways home remain once they do. Detour and elapsed
 * time still count, but only after those two.
 */
function escapeScoreOf(option: RankedOption, gateway: GatewayOption): number {
  const waysOut = Math.min(gateway.inboundShots.length, 4) * 7;
  const waysHome = Math.min(gateway.onwardCount, 4) * 6;
  const recovery =
    gateway.recoveryState === "good" ? 8 : gateway.recoveryState === "fair" ? 3 : 0;
  const operations = gateway.state === "good" ? 5 : gateway.state === "fair" ? 2 : -4;
  return option.score + waysOut + waysHome + recovery + operations;
}



export interface EscapeViaResult {
  gateway: GatewayOption | null;
  option: RankedOption | null;
  /** Plain-language reason when the routing does not work. */
  reason: string | null;
}

/**
 * The expert check: "I know OKC works — evaluate it." Runs the same Escape
 * engine for one traveller-named station, skipping the detour veto (they
 * asked for it) but keeping the connection and carrier rules.
 */
export async function evaluateEscapeVia(input: RankInput, hubCode: string): Promise<EscapeViaResult> {
  const hub = hubCode.toUpperCase();
  const origin = input.origin.toUpperCase();
  const dest = input.dest.toUpperCase();
  if (sameCity(hub, origin) || sameCity(hub, dest)) {
    return { gateway: null, option: null, reason: `${hub} is one of the cities you already gave us.` };
  }

  const carrierFilter =
    input.carriers && input.carriers.length === 1
      ? (input.carriers[0] ?? ALL_AIRLINES)
      : ALL_AIRLINES;
  const allowed = input.carriers && input.carriers.length > 0 ? new Set(input.carriers) : null;

  const { legs: fromOrigin } = await findOriginDepartures(
    origin,
    input.travelDate,
    carrierFilter,
    input.depTime,
  );
  const inboundAll = fromOrigin
    .filter((l) => l.dest.toUpperCase() === hub)
    .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
    .sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  if (inboundAll.length === 0) {
    return {
      gateway: null,
      option: null,
      reason: `No flights leave ${origin} for ${hub} today on the airlines you can use.`,
    };
  }

  const { legs: onwardAll } = await findRouteLegs(hub, dest, input.travelDate, carrierFilter);
  const onward = onwardAll
    .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
    .sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
  if (onward.length === 0) {
    return {
      gateway: null,
      option: null,
      reason: `You can reach ${hub}, but nothing useful leaves ${hub} for ${dest} today.`,
    };
  }

  const pairs: ConnectionCandidate[] = [];
  const inbound: RouteLeg[] = [];
  for (const first of inboundAll) {
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
  if (pairs.length === 0) {
    return {
      gateway: null,
      option: null,
      reason: `${origin} → ${hub} → ${dest} exists on paper, but no connection works today — the onward flights leave too soon or too late.`,
    };
  }

  const best = pairs[0]!;
  const earliestArr = new Date(best.first.schedArrUtc).getTime();
  const usableOnward = onward.filter(
    (l) => (new Date(l.schedDepUtc).getTime() - earliestArr) / 60000 >= MIN_LAYOVER,
  );

  const geo = await airportGeo([origin, dest, hub]);
  const from = geo.get(origin);
  const to = geo.get(dest);
  const h = geo.get(hub);
  const direct = from && to ? milesBetween(from, to) : null;
  const ratio =
    h && from && to && direct && direct >= 50
      ? (milesBetween(from, h) + milesBetween(h, to)) / direct
      : null;

  const faa = await getFaaPrograms();
  const programs = (faa.data ?? []).filter((p) => p.airport === hub);
  const stopped = programs.some((p) => p.type === "ground_stop" || p.type === "closure");
  const delayed = programs.some((p) => p.type === "ground_delay" || p.type === "delay");

  let state: PillarState = "fair";
  let label = "Possible";
  if (stopped) {
    state = "poor";
    label = "Weak today";
  } else if (inbound.length >= 3 && usableOnward.length >= 4 && !delayed) {
    state = "good";
    label = "Strong alternate";
  } else if (inbound.length >= 2 && usableOnward.length >= 2) {
    label = "Good alternative";
  }

  let caveat: string | null = null;
  if (stopped) caveat = `Today's ${hub} operation is unstable.`;
  else if (delayed) caveat = `${hub} is running a delay program today.`;
  else if (ratio !== null && ratio >= BACKTRACK_HINT)
    caveat = "It works, but it means backtracking geographically.";

  const build: GatewayBuild = {
    hub,
    city: h?.city ?? null,
    inbound: inbound.slice(0, 6),
    onward: usableOnward,
    best,
    addedMinutes:
      direct !== null && ratio !== null ? Math.round((ratio - 1) * (direct / 480) * 60) : null,
    caveat,
    state,
    label,
    summary: `${inbound.length} realistic shot${inbound.length === 1 ? "" : "s"} into ${h?.city ?? hub}, ${usableOnward.length} useful flight${usableOnward.length === 1 ? "" : "s"} onward to ${dest}.`,
    recoveryState: usableOnward.length >= 4 ? "good" : usableOnward.length >= 2 ? "fair" : "poor",
    recoveryLabel:
      usableOnward.length >= 4 ? "Excellent" : usableOnward.length >= 2 ? "Good" : "Thin",
  };

  const holiday = await holidayFor(dest, input.travelDate);
  const boards = new Map<string, Board>();
  const legsNeeded = [best.first, best.second];
  const fetched = await Promise.all(
    legsNeeded.map((leg) =>
      availabilityBoard({ ...input, origin: leg.origin, dest: leg.dest }, "quick"),
    ),
  );
  legsNeeded.forEach((leg, i) => {
    const board = fetched[i];
    if (board) boards.set(`${leg.origin}-${leg.dest}`, board);
  });

  const option = await scoreConnection(input, build, boards, holiday);
  return { gateway: gatewayOptionOf(build, boards), option, reason: null };
}
