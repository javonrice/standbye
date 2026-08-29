/**
 * Cheap Watch signal gather (server I/O) + re-exports of pure gate helpers.
 */
import { airportMeta, icaoForAirport } from "@/lib/aircue/airport-lookup.server";
import { isFaaCoverageCountry } from "@/lib/aircue/coverage";
import {
  flightStatusToReconcileState,
  reconcilePrimaryFlightStatus,
} from "@/lib/aircue/flight-status-reconcile";
import { fetchDepartureBoard, type AdbFlight } from "@/lib/aircue/aerodatabox.server";
import {
  getFlightProvider,
  type FlightStatus,
  type WatchStatusDetail,
} from "@/lib/aircue/flight-provider.server";
import { fidsCacheKey, preferredBoardWindow } from "@/lib/aircue/fids-cache-key";
import {
  getFaaPrograms,
  getMetar,
  getNwsAlerts,
  getTaf,
} from "@/lib/aircue/sources.server";
import { nextSafetyRefreshAt } from "@/lib/aircue/watch-config.server";
import type { StandbyOption } from "@/lib/aircue/standby";
import { watchFlightIdentity } from "@/lib/aircue/watch-flight-state.server";
import type { WeatherBand, WatchSignalState } from "@/lib/aircue/watch-signal-gate";

export type {
  WatchCycleOutcome,
  WeatherBand,
  WatchSignalState,
  WatchNotifyEvent,
  WatchGateDecision,
} from "@/lib/aircue/watch-signal-gate";

export {
  decideWatchOutcome,
  stampRankOnSignals,
  stampOutcomeOnSignals,
  logWatchCycle,
} from "@/lib/aircue/watch-signal-gate";

export interface WatchCycleMetrics {
  fidsCacheHit: boolean | null;
  statusCacheHit: boolean | null;
  adbUnitsEst: number;
  gf8Calls: number;
  rankingRan: boolean;
  operatorVerifyRan: boolean;
}

function stableHash(parts: string[]): string {
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function flightNumDigits(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function normalizeFlightMatch(
  departures: AdbFlight[],
  flightNumber: string,
  dest: string,
): AdbFlight | undefined {
  const want = flightNumDigits(flightNumber);
  const digWant = want.replace(/\D/g, "");
  return departures.find((f) => {
    const num = flightNumDigits(f.number ?? "");
    const digHave = num.replace(/\D/g, "");
    if (num !== want && digHave !== digWant) return false;
    const far = f.movement ?? f.arrival;
    const farIata = far?.airport?.iata?.toUpperCase();
    return !dest || !farIata || farIata === dest.toUpperCase();
  });
}

function parseDepLocalClock(anchor: StandbyOption): string {
  const seg = anchor.segments?.[0]?.depLocal;
  if (seg && /^\d{1,2}:\d{2}/.test(seg) && !/am|pm/i.test(seg)) {
    const [h, m] = seg.split(":");
    return `${h!.padStart(2, "0")}:${m!.slice(0, 2)}`;
  }
  const raw = anchor.depLocal ?? "";
  const m = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return "12:00";
  let hour = Number(m[1]);
  const min = m[2]!;
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && hour < 12) hour += 12;
  if (ap === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${min}`;
}

async function environmentFingerprint(
  origin: string,
  dest: string,
): Promise<{ faaFingerprint: string; weatherBand: WeatherBand; weatherFingerprint: string }> {
  try {
    const [originMeta, destMeta, icao] = await Promise.all([
      airportMeta(origin),
      airportMeta(dest),
      icaoForAirport(origin),
    ]);
    const faaCovered =
      isFaaCoverageCountry(originMeta?.country) || isFaaCoverageCountry(destMeta?.country);

    const [faa, metar, taf, nws] = await Promise.all([
      faaCovered ? getFaaPrograms() : Promise.resolve(null),
      icao ? getMetar(icao) : Promise.resolve(null),
      icao ? getTaf(icao) : Promise.resolve(null),
      originMeta ? getNwsAlerts(originMeta.lat, originMeta.lon) : Promise.resolve(null),
    ]);

    const programs = faa
      ? (faa.data ?? []).filter((p) => p.airport === origin || p.airport === dest)
      : [];
    const faaParts = programs.map((p) => `${p.airport}:${p.type}:${p.endTime ?? ""}`).sort();

    const metarText = metar?.data?.[0]
      ? ((metar.data![0] as { rawOb?: string; raw?: string }).rawOb ??
        (metar.data![0] as { raw?: string }).raw ??
        "")
      : "";
    const tafText = taf?.data?.[0]
      ? ((taf.data![0] as { rawTAF?: string; raw?: string }).rawTAF ??
        (taf.data![0] as { raw?: string }).raw ??
        "")
      : "";
    const stormy = /TS|SQ|FZRA|\+RA|BLSN/.test(tafText);
    const nwsEvents = (nws?.data ?? [])
      .map((a) => `${a.properties?.event ?? ""}:${a.properties?.severity ?? ""}`)
      .filter(Boolean)
      .sort();
    const nwsSevere = nwsEvents.some((e) => /warning|severe|extreme/i.test(e));
    const nwsWatch = nwsEvents.some((e) => /watch|advisory/i.test(e));

    const stop = programs.find((p) => p.type === "ground_stop" || p.type === "closure");
    const delayProgram = programs.find((p) => p.type === "ground_delay" || p.type === "delay");

    let weatherBand: WeatherBand = "clear";
    if (stop || nwsSevere) weatherBand = "impact";
    else if (delayProgram || stormy || nwsWatch) weatherBand = "watch";

    return {
      faaFingerprint: stableHash(faaParts.length ? faaParts : ["none"]),
      weatherBand,
      weatherFingerprint: stableHash([
        weatherBand,
        stormy ? "storm" : "clear",
        metarText.slice(0, 40),
        ...nwsEvents.slice(0, 8),
      ]),
    };
  } catch (error) {
    console.error("[watch-signals] environmentFingerprint", error);
    return {
      faaFingerprint: "err",
      weatherBand: "clear",
      weatherFingerprint: "err",
    };
  }
}

export interface GatherInput {
  origin: string;
  dest: string;
  travelDate: string;
  planId?: string;
  anchor: StandbyOption;
  hoursUntilDeparture: number;
  prev?: WatchSignalState | null;
  forceStatusRefresh?: boolean;
  now?: Date;
}

export interface GatherResult {
  signals: WatchSignalState;
  status: FlightStatus | null;
  statusUnavailable: boolean;
  emitCancellationFromBoard: boolean;
  metrics: Pick<WatchCycleMetrics, "fidsCacheHit" | "statusCacheHit" | "adbUnitsEst">;
}

/** Gather free + shared Watch signals (no GF8 / no rank). */
export async function gatherWatchSignals(input: GatherInput): Promise<GatherResult> {
  const now = input.now ?? new Date();
  const identity = watchFlightIdentity(input.anchor);
  const flightNumber = identity?.flightNumber ?? input.anchor.flightLabel;
  const origin = identity?.origin ?? input.origin;
  const dest = identity?.dest ?? input.dest;
  const carrier = input.anchor.carrier ?? flightNumber.slice(0, 2);
  const depLocal = parseDepLocalClock(input.anchor);

  let status: FlightStatus | null = null;
  let statusUnavailable = true;
  let detail: WatchStatusDetail | undefined;
  let statusCacheHit: boolean | null = null;
  let adbUnitsEst = 0;

  if (identity) {
    try {
      const provider = getFlightProvider();
      const result = await provider.getWatchStatus(
        identity.flightNumber,
        input.travelDate,
        input.planId,
        { origin: identity.origin, dest: identity.dest },
        { forceRefresh: input.forceStatusRefresh === true },
      );
      status = result.status;
      statusUnavailable = result.unavailable;
      detail = result.detail;
      statusCacheHit = detail?.fromCache ?? null;
      if (statusCacheHit === false) adbUnitsEst += 2;
    } catch (error) {
      console.error("[watch-signals] getWatchStatus", error);
    }
  }

  const window = preferredBoardWindow(input.travelDate, depLocal);
  const windowKey = fidsCacheKey(origin, input.travelDate, window.start, window.end);
  let fidsCacheHit: boolean | null = null;
  let departures: AdbFlight[] = [];
  try {
    const board = await fetchDepartureBoard(origin, input.travelDate, window.start, window.end);
    departures = board.departures;
    fidsCacheHit = board.fromCache;
    if (!board.fromCache && !board.budgetBlocked) adbUnitsEst += 2;
  } catch (error) {
    console.error("[watch-signals] FIDS", error);
  }

  const fidsRow = normalizeFlightMatch(departures, flightNumber, dest);
  const reconcile = reconcilePrimaryFlightStatus({
    numberStatus: flightStatusToReconcileState(status?.state),
    fidsStatusRaw: fidsRow?.status ?? null,
  });

  const routeKey = `${carrier}:${dest}`;
  const earlierCancelled = departures.filter((f) => {
    const far = f.movement ?? f.arrival;
    if (far?.airport?.iata?.toUpperCase() !== dest.toUpperCase()) return false;
    if (carrier !== "ALL" && f.airline?.iata?.toUpperCase() !== carrier.toUpperCase()) return false;
    const local = (f.departure?.scheduledTime?.local ?? "").slice(11, 16);
    if (!local || local >= depLocal) return false;
    return (f.status ?? "").toLowerCase().includes("cancel");
  });
  const cancelledFlightNumbers = [
    ...new Set(earlierCancelled.map((f) => flightNumDigits(f.number ?? "")).filter(Boolean)),
  ].sort();

  const env = await environmentFingerprint(origin, dest);

  const gate = detail?.gate ?? fidsRow?.departure?.gate ?? null;
  const terminal = detail?.terminal ?? fidsRow?.departure?.terminal ?? null;
  const schedDepLocal =
    detail?.schedDepLocal ??
    (fidsRow?.departure?.scheduledTime?.local
      ? fidsRow.departure.scheduledTime.local.slice(11, 16)
      : depLocal);
  const revisedDepLocal =
    detail?.revisedDepLocal ??
    (fidsRow?.departure?.revisedTime?.local
      ? fidsRow.departure.revisedTime.local.slice(11, 16)
      : null);

  const prev = input.prev;
  const signals: WatchSignalState = {
    v: 1,
    checkedAt: now.toISOString(),
    nextSafetyRefreshAt:
      prev?.nextSafetyRefreshAt && prev.lastRankAt
        ? prev.nextSafetyRefreshAt
        : nextSafetyRefreshAt(input.hoursUntilDeparture, now),
    primary: {
      flightNumber,
      origin,
      dest,
      state: reconcile.state,
      schedDepLocal,
      revisedDepLocal,
      gate,
      terminal,
      boardConflict: reconcile.boardConflict,
      source: reconcile.source,
    },
    cancelPressure: {
      origin,
      date: input.travelDate,
      windowKey,
      byRoute: {
        [routeKey]: {
          count: cancelledFlightNumbers.length,
          flightNumbers: cancelledFlightNumbers,
        },
      },
    },
    environment: env,
    lastRankAt: prev?.lastRankAt ?? null,
    lastRankTrigger: prev?.lastRankTrigger ?? null,
    lastOutcome: prev?.lastOutcome ?? "rerank",
  };

  return {
    signals,
    status,
    statusUnavailable,
    emitCancellationFromBoard: reconcile.emitCancellationFromBoard,
    metrics: { fidsCacheHit, statusCacheHit, adbUnitsEst },
  };
}
