/**
 * Live integration smoke for PlanStrategy + ADB + GF8.
 *
 * Tier A — direct RapidAPI (no Supabase cache required)
 * Tier B — full rankStandbyOptions when SUPABASE_SERVICE_ROLE_KEY is set
 *
 * Usage:
 *   AERODATABOX_RAPIDAPI_KEY=... GOOGLE_FLIGHTS8_RAPIDAPI_KEY=... \
 *   bun scripts/test-plan-strategy-live.ts
 */
import {
  buildStrategyCatalog,
  connectionPathFromLegs,
  strategyIdFromPath,
} from "@/lib/aircue/plan-strategy";

const RAPIDAPI_KEY =
  process.env["AERODATABOX_RAPIDAPI_KEY"] ?? process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"];
const TRAVEL_DATE = process.env["PLAN_STRATEGY_TEST_DATE"] ?? "2026-08-31";
const ORIGIN = process.env["PLAN_STRATEGY_TEST_ORIGIN"] ?? "IAH";
const DEST = process.env["PLAN_STRATEGY_TEST_DEST"] ?? "ORD";
const CARRIER = "UA";

const ADB_HOST = "aerodatabox.p.rapidapi.com";
const GF8_HOST = "google-flights8.p.rapidapi.com";
const MIN_LAYOVER = 60;
const MAX_LAYOVER = 360;
const MAX_DISCOVER = Number(process.env["PLAN_STRATEGY_TEST_MAX_DISCOVER"] ?? 4);
const HUB_FETCH_DELAY_MS = 1500;

interface LiveResult {
  timestamp: string;
  config: { origin: string; dest: string; travelDate: string; carrier: string };
  adb: { ok: boolean; departureFlights: number; ms: number; error?: string };
  gf8Board: { ok: boolean; flights: number; ms: number; error?: string };
  gf8Itins: { ok: boolean; candidates: number; connectionCandidates: number; ms: number; error?: string };
  liveDiscovery: {
    ok: boolean;
    candidateHubs: number;
    verifiedConnections: number;
    strategies: Array<{ id: string; path: string[]; hasGateway: boolean }>;
    ms: number;
    error?: string;
  };
  rankStandby?: {
    ok: boolean;
    optionCount: number;
    strategyCount: number;
    strategies: Array<{ id: string; path: string[] }>;
    ms: number;
    skipped?: string;
    error?: string;
  };
  unitTests: { pass: number; fail: number };
  assertions: Record<string, boolean>;
}

function adbHeaders(): Record<string, string> {
  if (!RAPIDAPI_KEY) throw new Error("Set AERODATABOX_RAPIDAPI_KEY or GOOGLE_FLIGHTS8_RAPIDAPI_KEY");
  return {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": ADB_HOST,
    Accept: "application/json",
  };
}

function gf8Headers(): Record<string, string> {
  if (!RAPIDAPI_KEY) throw new Error("Set GOOGLE_FLIGHTS8_RAPIDAPI_KEY or AERODATABOX_RAPIDAPI_KEY");
  return {
    "x-rapidapi-key": RAPIDAPI_KEY,
    "x-rapidapi-host": GF8_HOST,
  };
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  retries = 3,
): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers });
    last = res;
    if (res.status !== 429) return res;
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return last!;
}

async function fetchAdbDepartures(
  airport: string,
  from: string,
  to: string,
): Promise<{ flights: unknown[]; ms: number; error?: string }> {
  const start = Date.now();
  try {
    const path = `/flights/airports/iata/${airport}/${TRAVEL_DATE}T${from}/${TRAVEL_DATE}T${to}?direction=Departure&withLeg=true&withCancelled=false&withCodeshared=true&withCargo=false&withPrivate=false`;
    const res = await fetchWithRetry(`https://${ADB_HOST}${path}`, adbHeaders());
    if (!res.ok) return { flights: [], ms: Date.now() - start, error: `ADB ${airport} ${res.status}` };
    const body = (await res.json()) as { departures?: unknown[] } | unknown[];
    const flights = Array.isArray(body) ? body : (body.departures ?? []);
    return { flights, ms: Date.now() - start };
  } catch (err) {
    return {
      flights: [],
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchAdbRouteLegs(
  origin: string,
  dest: string,
): Promise<{ flights: unknown[]; ms: number; error?: string }> {
  const start = Date.now();
  const errors: string[] = [];
  const windows: Array<[string, string]> = [
    ["00:00", "11:59"],
    ["12:00", "23:59"],
  ];
  const all: unknown[] = [];
  for (const [from, to] of windows) {
    try {
      const { flights, ms, error } = await fetchAdbDepartures(origin, from, to);
      if (error) errors.push(error);
      all.push(...flights);
      if (ms > 0) void ms;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const destUpper = dest.toUpperCase();
  const flights = all.filter((f) => {
    const row = f as { movement?: { airport?: { iata?: string } }; arrival?: { airport?: { iata?: string } } };
    const code = row.arrival?.airport?.iata ?? row.movement?.airport?.iata;
    return code?.toUpperCase() === destUpper;
  });
  return {
    flights,
    ms: Date.now() - start,
    ...(errors.length > 0 ? { error: errors.slice(0, 2).join("; ") } : {}),
  };
}

type RawLeg = {
  origin: string;
  dest: string;
  schedDepUtc: string;
  schedArrUtc: string;
  airlineCode?: string;
};

function parseLeg(flight: unknown, boardOrigin: string): RawLeg | null {
  const f = flight as {
    airline?: { iata?: string };
    departure?: { scheduledTime?: { utc?: string }; airport?: { iata?: string } };
    arrival?: { scheduledTime?: { utc?: string }; airport?: { iata?: string } };
    movement?: { scheduledTime?: { utc?: string }; airport?: { iata?: string } };
  };
  const dep = f.departure?.scheduledTime?.utc ?? f.movement?.scheduledTime?.utc;
  const arr = f.arrival?.scheduledTime?.utc;
  const origin = f.departure?.airport?.iata ?? boardOrigin;
  const dest = f.arrival?.airport?.iata ?? f.movement?.airport?.iata;
  if (!dep || !arr || !origin || !dest) return null;
  const toIso = (raw: string) => new Date(raw.replace(" ", "T").replace("Z", "") + "Z").toISOString();
  return {
    origin: origin.toUpperCase(),
    dest: dest.toUpperCase(),
    schedDepUtc: toIso(dep),
    schedArrUtc: toIso(arr),
    airlineCode: f.airline?.iata?.toUpperCase(),
  };
}

async function discoverLiveStrategies(): Promise<LiveResult["liveDiscovery"]> {
  const start = Date.now();
  const [win1, win2] = await Promise.all([
    fetchAdbDepartures(ORIGIN, "00:00", "11:59"),
    fetchAdbDepartures(ORIGIN, "12:00", "23:59"),
  ]);
  const inboundAll = [...win1.flights, ...win2.flights]
    .map((f) => parseLeg(f, ORIGIN))
    .filter((l): l is RawLeg => l != null)
    .filter((l) => l.airlineCode === CARRIER || !l.airlineCode)
    .filter((l) => l.dest !== DEST && l.dest !== ORIGIN);

  const byHub = new Map<string, RawLeg[]>();
  for (const leg of inboundAll) {
    const list = byHub.get(leg.dest) ?? [];
    list.push(leg);
    byHub.set(leg.dest, list);
  }

  const hubCandidates = [...byHub.keys()]
    .filter((hub) => hub.length === 3 && /^[A-Z]{3}$/.test(hub))
    .sort((a, b) => (byHub.get(b)?.length ?? 0) - (byHub.get(a)?.length ?? 0))
    .slice(0, MAX_DISCOVER);
  const verified: Array<{ path: string[]; hub: string }> = [];
  const hubErrors: string[] = [];

  for (const hub of hubCandidates) {
    if (HUB_FETCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, HUB_FETCH_DELAY_MS));
    const { flights, error } = await fetchAdbRouteLegs(hub, DEST);
    if (error) hubErrors.push(error);
    const onward = flights
        .map((f) => parseLeg(f, hub))
        .filter((l): l is RawLeg => l != null)
        .filter((l) => l.airlineCode === CARRIER || !l.airlineCode)
        .sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));

      const inbound = (byHub.get(hub) ?? []).sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));
      for (const first of inbound) {
        const arr = new Date(first.schedArrUtc).getTime();
        const second = onward.find((l) => {
          const gap = (new Date(l.schedDepUtc).getTime() - arr) / 60000;
          return gap >= MIN_LAYOVER && gap <= MAX_LAYOVER;
        });
        if (!second) continue;
        verified.push({
          hub,
          path: connectionPathFromLegs({
            firstOrigin: first.origin,
            via: hub,
            finalDest: second.dest,
          }),
        });
        break;
      }
  }

  const gatewayBuilds = verified.map((v) => ({
    hub: v.hub,
    best: { first: { origin: v.path[0]! }, second: { dest: v.path[2]! } },
  }));
  const gateways = verified.map((v) => ({
    hub: v.hub,
    city: v.hub,
    state: "fair" as const,
    label: "Possible",
    summary: `${v.path[0]} → ${v.hub} → ${v.path[2]} verified live`,
    inboundShots: [],
    onwardDepartures: [],
    onwardCount: 1,
    recoveryState: "fair" as const,
    recoveryLabel: "Good",
    caveat: null,
    addedMinutes: null,
  }));

  const directPath = [ORIGIN, DEST];
  const strategies = buildStrategyCatalog({
    rankedOptions: [],
    gatewayBuilds,
    gateways,
  });

  if (!strategies.some((s) => s.id === strategyIdFromPath(directPath))) {
    strategies.unshift({
      id: strategyIdFromPath(directPath),
      path: directPath,
      gateway: null,
      discoveryOrder: -1,
    });
  }

  return {
    ok: strategies.length >= 1,
    candidateHubs: byHub.size,
    verifiedConnections: verified.length,
    strategies: strategies.map((s) => ({
      id: s.id,
      path: s.path,
      hasGateway: Boolean(s.gateway),
    })),
    ms: Date.now() - start,
    ...(hubErrors.length > 0 ? { error: hubErrors.slice(0, 3).join("; ") } : {}),
  };
}

async function fetchGf8Search(): Promise<{ flights: unknown[]; ms: number }> {
  const start = Date.now();
  const qs = new URLSearchParams({
    origin: ORIGIN,
    destination: DEST,
    date: TRAVEL_DATE,
    trip_type: "one-way",
    adults: "1",
    currency: "USD",
  });
  const res = await fetch(`https://${GF8_HOST}/api/v1/search?${qs}`, { headers: gf8Headers() });
  if (!res.ok) throw new Error(`GF8 search ${res.status}`);
  const body = (await res.json()) as { flights?: unknown[] };
  return { flights: body.flights ?? [], ms: Date.now() - start };
}

async function tryRankStandby(): Promise<LiveResult["rankStandby"]> {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    return {
      ok: false,
      optionCount: 0,
      strategyCount: 0,
      strategies: [],
      ms: 0,
      skipped: "SUPABASE_SERVICE_ROLE_KEY not set — full rankStandbyOptions requires Supabase cache/airports",
    };
  }
  process.env["AERODATABOX_RAPIDAPI_KEY"] = RAPIDAPI_KEY!;
  process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"] = RAPIDAPI_KEY!;
  process.env["AERODATABOX_ENABLED"] = "true";
  process.env["GOOGLE_FLIGHTS8_ENABLED"] = "true";
  const start = Date.now();
  try {
    const { rankStandbyOptions } = await import("@/lib/aircue/ranking.server");
    const ranked = await rankStandbyOptions({
      origin: ORIGIN,
      dest: DEST,
      travelDate: TRAVEL_DATE,
      carriers: [CARRIER],
      travelers: 1,
      cabin: "any",
      userId: "live-test",
      maxStops: 1,
      nearby: false,
      routingMode: "best",
    });
    return {
      ok: ranked.strategies.length >= 1,
      optionCount: ranked.options.length,
      strategyCount: ranked.strategies.length,
      strategies: ranked.strategies.map((s) => ({ id: s.id, path: s.path })),
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      optionCount: 0,
      strategyCount: 0,
      strategies: [],
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runUnitTests(): Promise<{ pass: number; fail: number }> {
  const proc = Bun.spawn(["bun", "test", "src/lib/aircue/__tests__/plan-strategy.test.ts"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  const text = stdout + stderr;
  const pass = Number(text.match(/(\d+) pass/)?.[1] ?? 0);
  const fail = Number(text.match(/(\d+) fail/)?.[1] ?? 0);
  if (code !== 0 && pass === 0) {
    console.error(text.slice(0, 500));
  }
  return { pass, fail };
}

async function main(): Promise<void> {
  const result: LiveResult = {
    timestamp: new Date().toISOString(),
    config: { origin: ORIGIN, dest: DEST, travelDate: TRAVEL_DATE, carrier: CARRIER },
    adb: { ok: false, departureFlights: 0, ms: 0 },
    gf8Board: { ok: false, flights: 0, ms: 0 },
    gf8Itins: { ok: false, candidates: 0, connectionCandidates: 0, ms: 0 },
    liveDiscovery: { ok: false, candidateHubs: 0, verifiedConnections: 0, strategies: [], ms: 0 },
    unitTests: { pass: 0, fail: 0 },
    assertions: {},
  };

  try {
    const [w1, w2] = await Promise.all([
      fetchAdbDepartures(ORIGIN, "00:00", "11:59"),
      fetchAdbDepartures(ORIGIN, "12:00", "23:59"),
    ]);
    result.adb = {
      ok: w1.flights.length + w2.flights.length > 0,
      departureFlights: w1.flights.length + w2.flights.length,
      ms: w1.ms + w2.ms,
      ...([w1.error, w2.error].filter(Boolean).length
        ? { error: [w1.error, w2.error].filter(Boolean).join("; ") }
        : {}),
    };
  } catch (err) {
    result.adb.error = err instanceof Error ? err.message : String(err);
  }

  try {
    const gf8 = await fetchGf8Search();
    const connectionCount = gf8.flights.filter((f) => {
      const segs = (f as { segments?: unknown[] }).segments ?? [];
      return segs.length >= 2;
    }).length;
    result.gf8Itins = {
      ok: gf8.flights.length > 0,
      candidates: gf8.flights.length,
      connectionCandidates: connectionCount,
      ms: gf8.ms,
    };
    result.gf8Board = {
      ok: gf8.flights.some((f) => ((f as { segments?: unknown[] }).segments ?? []).length === 1),
      flights: gf8.flights.filter((f) => ((f as { segments?: unknown[] }).segments ?? []).length === 1)
        .length,
      ms: gf8.ms,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.gf8Board.error = msg;
    result.gf8Itins.error = msg;
  }

  try {
    result.liveDiscovery = await discoverLiveStrategies();
  } catch (err) {
    result.liveDiscovery = {
      ok: false,
      candidateHubs: 0,
      verifiedConnections: 0,
      strategies: [],
      ms: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  result.rankStandby = await tryRankStandby();
  result.unitTests = await runUnitTests();

  result.assertions = {
    adbReachable: result.adb.ok,
    gf8Reachable: result.gf8Itins.ok,
    liveStrategiesBuilt: result.liveDiscovery.strategies.length >= 1,
    uniqueStrategyIds:
      new Set(result.liveDiscovery.strategies.map((s) => s.id)).size ===
      result.liveDiscovery.strategies.length,
    everyWayThereEligible: result.liveDiscovery.strategies.length > 1,
    connectionPathsDiscovered: result.liveDiscovery.verifiedConnections >= 1,
    unitTestsPass: result.unitTests.fail === 0 && result.unitTests.pass >= 11,
    fullRankAvailable: Boolean(result.rankStandby?.ok),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.assertions.adbReachable || !result.assertions.unitTestsPass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
