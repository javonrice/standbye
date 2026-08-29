/**
 * Pure Watch signal types + gate (no server I/O).
 */
import { nextSafetyRefreshAt } from "@/lib/aircue/watch-config.server";
import type { ReconciledPrimaryState, StatusSource } from "@/lib/aircue/flight-status-reconcile";

export type WatchCycleOutcome = "skip" | "notify-only" | "rerank";

export type WeatherBand = "clear" | "watch" | "impact";

export interface WatchSignalState {
  v: 1;
  checkedAt: string;
  nextSafetyRefreshAt: string;
  primary: {
    flightNumber: string;
    origin: string;
    dest: string;
    state: ReconciledPrimaryState;
    schedDepLocal?: string | null;
    revisedDepLocal?: string | null;
    gate?: string | null;
    terminal?: string | null;
    boardConflict?: boolean;
    source: StatusSource;
  };
  cancelPressure: {
    origin: string;
    date: string;
    windowKey: string;
    byRoute: Record<string, { count: number; flightNumbers: string[] }>;
  };
  environment: {
    faaFingerprint: string;
    weatherBand: WeatherBand;
    weatherFingerprint: string;
  };
  lastRankAt: string | null;
  lastRankTrigger: string | null;
  lastOutcome: WatchCycleOutcome;
}

export interface WatchNotifyEvent {
  kind: string;
  severity: string;
  headline: string;
  detail: string;
}

export interface WatchGateDecision {
  outcome: WatchCycleOutcome;
  trigger: string | null;
  notifyEvents: WatchNotifyEvent[];
  forceStatusRefresh: boolean;
}

function parseLocalMinutes(clock: string | null | undefined): number | null {
  if (!clock || !/^\d{2}:\d{2}/.test(clock)) return null;
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

function delayMinutesChanged(
  prevSched: string | null | undefined,
  prevRev: string | null | undefined,
  nextSched: string | null | undefined,
  nextRev: string | null | undefined,
): boolean {
  const prevEffective = parseLocalMinutes(prevRev ?? prevSched);
  const nextEffective = parseLocalMinutes(nextRev ?? nextSched);
  if (prevEffective == null || nextEffective == null) return false;
  return Math.abs(nextEffective - prevEffective) >= 15;
}

function weatherBandWorsened(prev: WeatherBand, next: WeatherBand): boolean {
  const rank = { clear: 0, watch: 1, impact: 2 } as const;
  return rank[next] > rank[prev];
}

/**
 * Compare previous vs current signal snapshot → skip | notify-only | rerank.
 */
export function decideWatchOutcome(
  prev: WatchSignalState | null | undefined,
  next: WatchSignalState,
  opts: { now?: Date; primaryStillCurrent?: boolean } = {},
): WatchGateDecision {
  const now = opts.now ?? new Date();
  const notifyEvents: WatchNotifyEvent[] = [];

  if (!prev || prev.v !== 1) {
    return {
      outcome: "rerank",
      trigger: "bootstrap",
      notifyEvents: [],
      forceStatusRefresh: false,
    };
  }

  if (opts.primaryStillCurrent === false) {
    return {
      outcome: "rerank",
      trigger: "primary_missing",
      notifyEvents: [],
      forceStatusRefresh: true,
    };
  }

  if (new Date(prev.nextSafetyRefreshAt).getTime() <= now.getTime()) {
    return {
      outcome: "rerank",
      trigger: "safety_refresh",
      notifyEvents: [],
      forceStatusRefresh: true,
    };
  }

  if (prev.primary.state !== next.primary.state) {
    const material =
      next.primary.state === "cancelled" ||
      prev.primary.state === "cancelled" ||
      next.primary.state === "departed" ||
      prev.primary.state === "departed" ||
      next.primary.state === "delayed" ||
      prev.primary.state === "delayed" ||
      (prev.primary.state === "unknown" && next.primary.state === "operating") ||
      (prev.primary.state === "operating" && next.primary.state === "unknown");
    if (material) {
      return {
        outcome: "rerank",
        trigger:
          next.primary.state === "cancelled"
            ? "primary_cancelled"
            : `primary_${next.primary.state}`,
        notifyEvents: [],
        forceStatusRefresh: false,
      };
    }
  }

  if (
    delayMinutesChanged(
      prev.primary.schedDepLocal,
      prev.primary.revisedDepLocal,
      next.primary.schedDepLocal,
      next.primary.revisedDepLocal,
    )
  ) {
    return {
      outcome: "rerank",
      trigger: "primary_delay",
      notifyEvents: [],
      forceStatusRefresh: false,
    };
  }

  for (const [route, nextRoute] of Object.entries(next.cancelPressure.byRoute)) {
    const prevRoute = prev.cancelPressure.byRoute[route];
    const prevCount = prevRoute?.count ?? 0;
    const prevSet = new Set(prevRoute?.flightNumbers ?? []);
    const added = nextRoute.flightNumbers.filter((n) => !prevSet.has(n));
    if (nextRoute.count > prevCount || added.length > 0) {
      return {
        outcome: "rerank",
        trigger: "cancel_pressure",
        notifyEvents: [],
        forceStatusRefresh: false,
      };
    }
  }

  if (prev.environment.faaFingerprint !== next.environment.faaFingerprint) {
    return {
      outcome: "rerank",
      trigger: "faa",
      notifyEvents: [],
      forceStatusRefresh: false,
    };
  }

  if (
    prev.environment.weatherFingerprint !== next.environment.weatherFingerprint &&
    weatherBandWorsened(prev.environment.weatherBand, next.environment.weatherBand)
  ) {
    return {
      outcome: "rerank",
      trigger: "weather",
      notifyEvents: [],
      forceStatusRefresh: false,
    };
  }

  if (prev.primary.gate && next.primary.gate && prev.primary.gate !== next.primary.gate) {
    notifyEvents.push({
      kind: "gate_changed",
      severity: "context",
      headline: "Gate changed",
      detail: `Gate moved from ${prev.primary.gate} to ${next.primary.gate}.`,
    });
  }
  if (
    prev.primary.terminal &&
    next.primary.terminal &&
    prev.primary.terminal !== next.primary.terminal
  ) {
    notifyEvents.push({
      kind: "terminal_changed",
      severity: "context",
      headline: "Terminal changed",
      detail: `Terminal moved from ${prev.primary.terminal} to ${next.primary.terminal}.`,
    });
  }
  if (!prev.primary.boardConflict && next.primary.boardConflict) {
    notifyEvents.push({
      kind: "board_conflict",
      severity: "context",
      headline: "Board status conflict",
      detail: "Airport board and flight status disagree; Standbye is trusting flight status.",
    });
  }

  if (notifyEvents.length > 0) {
    return {
      outcome: "notify-only",
      trigger: notifyEvents[0]!.kind,
      notifyEvents,
      forceStatusRefresh: false,
    };
  }

  return {
    outcome: "skip",
    trigger: null,
    notifyEvents: [],
    forceStatusRefresh: false,
  };
}

export function stampRankOnSignals(
  signals: WatchSignalState,
  trigger: string | null,
  hoursUntilDeparture: number,
  now: Date = new Date(),
): WatchSignalState {
  return {
    ...signals,
    lastRankAt: now.toISOString(),
    lastRankTrigger: trigger,
    lastOutcome: "rerank",
    nextSafetyRefreshAt: nextSafetyRefreshAt(hoursUntilDeparture, now),
    checkedAt: now.toISOString(),
  };
}

export function stampOutcomeOnSignals(
  signals: WatchSignalState,
  outcome: WatchCycleOutcome,
  trigger: string | null,
): WatchSignalState {
  return {
    ...signals,
    lastOutcome: outcome,
    lastRankTrigger: outcome === "rerank" ? trigger : signals.lastRankTrigger,
  };
}

export function logWatchCycle(entry: {
  watchId: string;
  planId: string;
  outcome: WatchCycleOutcome;
  trigger?: string | null;
  adbUnits: number;
  adbEndpoints?: string[];
  fidsCacheHit: boolean | null;
  statusCacheHit: boolean | null;
  gf8Calls: number;
  rankingRan: boolean;
  operatorVerifyRan: boolean;
  adbFidsUpstream?: number;
  adbStatusUpstream?: number;
  operatorVerifyAttempts?: number;
  durationMs: number;
}): void {
  console.info(JSON.stringify({ type: "watch_cycle", ...entry }));
}
