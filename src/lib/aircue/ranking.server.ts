/**
 * AirCue ranking engine.
 *
 * Turns a route + date into ranked standby setups. Four pillars — availability,
 * operations, history, recovery — feed an internal score. The score never
 * leaves this module: callers get a judgment label, pillar states and reasons.
 */
import { buildRouteBoard } from "@/lib/aircue/serpapi-flights.server";
import { findRouteLegs, type RouteLeg } from "@/lib/aircue/route-search.server";
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
} from "@/lib/aircue/standby";

export interface RankInput {
  origin: string;
  dest: string;
  travelDate: string;
  carriers: string[] | null;
  travelers: number;
  cabin: string;
  userId: string;
}

export interface RankedOption {
  rank: number;
  kind: "nonstop" | "connection";
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

export async function rankStandbyOptions(input: RankInput): Promise<RankedOption[]> {
  const carrierFilter =
    input.carriers && input.carriers.length === 1 ? (input.carriers[0] ?? ALL_AIRLINES) : ALL_AIRLINES;

  const [{ legs }, board, holiday] = await Promise.all([
    findRouteLegs(input.origin, input.dest, input.travelDate, carrierFilter),
    availabilityBoard(input),
    holidayFor(input.dest, input.travelDate),
  ]);

  const allowed = input.carriers && input.carriers.length > 0 ? new Set(input.carriers) : null;
  const usable = legs
    .filter((l) => !allowed || !l.airlineCode || allowed.has(l.airlineCode))
    .sort((a, b) => new Date(a.schedDepUtc).getTime() - new Date(b.schedDepUtc).getTime())
    .slice(0, 8);

  const provider = getFlightProvider();
  const results: RankedOption[] = [];

  for (const leg of usable) {
    const carrier = leg.airlineCode ?? null;
    const digits = leg.flightNumber ?? null;
    const flightLabel = carrier && digits ? `${carrier}${digits}` : `${leg.origin}→${leg.dest}`;
    const depLocal = hhmm(leg.schedDepUtc, leg.depLocalTime);
    const arrLocal = hhmm(leg.schedArrUtc);
    const localHour = leg.depLocalTime ? Number(leg.depLocalTime.slice(0, 2)) : null;

    const availability = availabilityFor(
      board.map.get(flightLabel),
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

    const later = usable.filter(
      (l) => new Date(l.schedDepUtc).getTime() > new Date(leg.schedDepUtc).getTime(),
    );
    const recovery = buildRecovery(later, board);

    let opsState = operations.state;
    let opsDetail = operations.detail;
    if ((cancels?.cancelledFlights ?? 0) > 0) {
      opsState = "poor";
      opsDetail = `${cancels?.cancelledFlights} earlier ${input.origin} → ${input.dest} departure${(cancels?.cancelledFlights ?? 0) > 1 ? "s were" : " was"} cancelled today, which pushes displaced travellers onto later flights.`;
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

    const score =
      stateScore[availability.state] * 1.2 +
      stateScore[opsState] * 1.0 +
      stateScore[recovery.state] * 0.8 +
      stateScore[history.state] * 0.4;
    const normalized = Math.round((score / (30 * 3.4)) * 100);
    const judgment = judgeScore(normalized, availability.state, recovery.state);

    const reasons: Reason[] = pillars.map((p) => ({
      key: p.key,
      state: p.state,
      title: reasonTitle(p),
      detail: p.detail,
    }));

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

    results.push({
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
      reasons,
      recovery,
      evidence: {
        availability: availability.evidence,
        conditions: operations.evidence,
        history: history.evidence,
        holiday,
      },
    });
  }

  results.sort((a, b) => b.score - a.score || minutesOfDay(a.schedDepUtc ?? "") - minutesOfDay(b.schedDepUtc ?? ""));
  results.forEach((r, i) => {
    r.rank = i + 1;
  });
  return results;
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
