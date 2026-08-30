/**
 * Integration economics: real S0–S4 Watch path with mocked provider boundaries.
 * Counts actual attempted upstream calls — no live API quota.
 */
import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { mockModuleIsolated } from "./mock-module-isolated";
import type { WatchSignalState } from "@/lib/aircue/watch-signal-gate";
import { stampRankOnSignals } from "@/lib/aircue/watch-signal-gate";
import {
  resetProviderUsage,
  snapshotProviderUsage,
  type ProviderUsageCounters,
} from "@/lib/aircue/provider-usage.server";

const TRAVEL_DATE = "2026-09-15";
const USER_ID = "econ-user";
const AIRPORTS = ["ORD", "DEN", "DFW", "ATL", "SEA"] as const;
const FLIGHTS = [
  "UA100",
  "UA101",
  "UA102",
  "UA103",
  "UA104",
  "UA105",
  "UA106",
  "UA107",
  "UA108",
  "UA109",
] as const;

/** In-memory source_cache shared by ADB + GF8 modules. */
const sourceCache = new Map<string, { payload: unknown; expires_at: string; fetched_at: string }>();

let fetchCalls: { url: string; host: string }[] = [];
/** Per-flight status override for disruption sim. */
const statusOverrides = new Map<string, string>();

const FUTURE = () => new Date(Date.now() + 3600_000).toISOString();

function clearCache() {
  sourceCache.clear();
}

await mockModuleIsolated("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "source_cache") {
        return {
          select: () => ({
            eq: (_col: string, key: string) => ({
              maybeSingle: () => {
                const hit = sourceCache.get(key);
                if (!hit) return Promise.resolve({ data: null });
                return Promise.resolve({
                  data: {
                    payload: hit.payload,
                    expires_at: hit.expires_at,
                    fetched_at: hit.fetched_at,
                    cache_key: key,
                  },
                });
              },
            }),
          }),
          upsert: (row: {
            cache_key: string;
            payload: unknown;
            expires_at: string;
            fetched_at: string;
          }) => {
            sourceCache.set(row.cache_key, {
              payload: row.payload,
              expires_at: row.expires_at,
              fetched_at: row.fetched_at,
            });
            return Promise.resolve({ data: null });
          },
        };
      }
      if (table === "airports") {
        // Compatible with airport-lookup.test fixtures when this mock wins process-wide.
        const ROWS: Array<Record<string, unknown>> = [
          {
            iata: "DEN",
            icao: "KDEN",
            lat: 39.86,
            lon: -104.67,
            city: "Denver",
            state: "CO",
            tz: "America/Denver",
            country: "US",
          },
          {
            iata: "HNL",
            icao: "PHNL",
            lat: 21.32,
            lon: -157.92,
            city: "Honolulu",
            state: "HI",
            tz: "Pacific/Honolulu",
            country: "US",
          },
          {
            iata: "NUL",
            icao: null,
            lat: 1,
            lon: 2,
            city: null,
            state: null,
            tz: null,
            country: null,
          },
          {
            iata: "ANC",
            icao: null,
            lat: 61.17,
            lon: -150.0,
            city: "Anchorage",
            state: "AK",
            tz: "America/Anchorage",
            country: "US",
          },
          {
            iata: "ORD",
            icao: "  kord ",
            lat: 41.97,
            lon: -87.9,
            city: "Chicago",
            state: "IL",
            tz: "America/Chicago",
            country: "US",
          },
          {
            iata: "YYZ",
            icao: null,
            lat: 43.68,
            lon: -79.63,
            city: "Toronto",
            state: null,
            tz: "America/Toronto",
            country: "CA",
          },
          // Extra airports used by the economics sim.
          ...["DFW", "ATL", "SEA", "SFO", "LAX"].map((iata) => ({
            iata,
            icao: `K${iata}`,
            lat: 33.0,
            lon: -97.0,
            city: iata,
            state: "TX",
            tz: "America/Chicago",
            country: "US",
          })),
        ];
        return {
          select: () => ({
            in: (_col: string, codes: string[]) => {
              const upper = codes.map((c) => c.toUpperCase());
              return Promise.resolve({
                data: ROWS.filter((r) => upper.includes(String(r["iata"]).toUpperCase())),
                error: null,
              });
            },
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null }),
            }),
            or: () => ({
              limit: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      if (table === "api_usage_log" || table === "serpapi_usage_log") {
        return { insert: () => Promise.resolve({ data: null }) };
      }
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 0 }),
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
        insert: () => Promise.resolve({ data: null }),
        upsert: () => Promise.resolve({ data: null }),
      };
    },
    rpc: () => Promise.resolve({ data: 0, error: null }),
  },
}));

// Use real airport-lookup (fed by airports table mock above) to avoid
// process-wide mock pollution of other test files.
await mockModuleIsolated("@/lib/aircue/sources.server", () => ({
  getFaaPrograms: async () => ({
    ok: true,
    stale: false,
    data: [],
    fetchedAt: new Date().toISOString(),
  }),
  getMetar: async () => ({ ok: true, stale: false, data: [], fetchedAt: new Date().toISOString() }),
  getTaf: async () => ({ ok: true, stale: false, data: [], fetchedAt: new Date().toISOString() }),
  getNwsAlerts: async () => ({
    ok: true,
    stale: false,
    data: [],
    fetchedAt: new Date().toISOString(),
  }),
  icaoForAirport: async (iata: string) => `K${iata}`,
  parseFaaXml: () => [],
}));

/** Ranking stub: still exercises real GF8 upstream when a Watch reranks. */
await mockModuleIsolated("@/lib/aircue/ranking.server", () => ({
  rankStandbyOptions: async (input: {
    origin: string;
    dest: string;
    travelDate: string;
    travelers: number;
  }) => {
    const { searchItineraryCandidates } = await import("@/lib/aircue/gf8-itineraries.server");
    const { buildRouteBoard } = await import("@/lib/aircue/google-flights8.server");
    await searchItineraryCandidates({
      origin: input.origin,
      dest: input.dest,
      date: input.travelDate,
      adults: 1,
    });
    await buildRouteBoard({
      origin: input.origin,
      dest: input.dest,
      date: input.travelDate,
      mode: "quick",
      carrier: null,
      deviceId: null,
    });
    return {
      options: [
        {
          rank: 1,
          kind: "nonstop",
          judgment: "mixed",
          confidence: "medium",
          score: 50,
          headline: "Stub",
          carrier: "UA",
          flightNumber: "100",
          flightLabel: "UA100",
          optionKey: `UA100:${input.origin}-${input.dest}:${TRAVEL_DATE}T22:10`,
          origin: input.origin,
          dest: input.dest,
          depLocal: "5:10 PM",
          arrLocal: "7:05 PM",
          schedDepUtc: `${TRAVEL_DATE}T22:10:00Z`,
          schedArrUtc: null,
          segments: [],
          pillars: [{ key: "operations", state: "good", label: "Ops", detail: "ok" }],
          reasons: [],
          recovery: {
            state: "unknown",
            label: "Unknown",
            summary: "",
            hoursRemaining: null,
            laterNonstops: [],
            alternates: [],
          },
          evidence: {
            availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
            conditions: null,
            history: null,
            holiday: null,
          },
          access: "home",
          staffEligibility: "eligible",
          operatorVerification: {
            status: "verified",
            checkedAt: new Date().toISOString(),
            source: "aerodatabox",
            note: null,
          },
          standbyClears: 1,
          commercialFare: null,
        },
      ],
      reason: null,
      scanned: { origins: [input.origin], dests: [input.dest] },
      gateways: [],
      nonstopCount: 1,
      incomplete: false,
    };
  },
}));

process.env["AERODATABOX_RAPIDAPI_KEY"] = "test-adb-key";
process.env["AERODATABOX_ENABLED"] = "true";
process.env["AERODATABOX_MIN_INTERVAL_MS"] = "0";
process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"] = "test-gf8-key";
process.env["GOOGLE_FLIGHTS8_ENABLED"] = "true";

function parseFlightFromStatusUrl(url: string): string | null {
  const m = url.match(/\/flights\/number\/([^/]+)\//);
  return m?.[1] ? decodeURIComponent(m[1]).toUpperCase() : null;
}

function parseFidsAirport(url: string): string | null {
  const m = url.match(/\/flights\/airports\/iata\/([A-Z]{3})\//i);
  return m?.[1]?.toUpperCase() ?? null;
}

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = String(input);
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "unknown";
  }
  fetchCalls.push({ url, host });

  if (host.includes("aerodatabox")) {
    if (url.includes("/flights/airports/iata/")) {
      const airport = parseFidsAirport(url) ?? "ORD";
      return new Response(
        JSON.stringify({
          departures: [
            {
              number: "UA999",
              status: "Expected",
              airline: { iata: "UA", name: "United" },
              departure: {
                scheduledTime: {
                  utc: `${TRAVEL_DATE} 12:00`,
                  local: `${TRAVEL_DATE} 07:00`,
                },
                gate: "C1",
                terminal: "1",
              },
              movement: { airport: { iata: "SFO" } },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/flights/number/")) {
      const flight = parseFlightFromStatusUrl(url) ?? "UA100";
      const status = statusOverrides.get(flight) ?? "Expected";
      const dest = "SFO";
      return new Response(
        JSON.stringify([
          {
            number: flight,
            status,
            airline: { iata: flight.slice(0, 2), name: "United" },
            departure: {
              airport: { iata: "ORD" },
              scheduledTime: {
                utc: `${TRAVEL_DATE} 22:10`,
                local: `${TRAVEL_DATE} 17:10`,
              },
              revisedTime: null,
              gate: "C12",
              terminal: "1",
            },
            arrival: {
              airport: { iata: dest },
              scheduledTime: {
                utc: `${TRAVEL_DATE} 02:05`,
                local: `${TRAVEL_DATE} 19:05`,
              },
            },
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  if (host.includes("google-flights8")) {
    return new Response(
      JSON.stringify({
        success: true,
        flights: [
          {
            name: "United",
            departure: `${TRAVEL_DATE} 17:10`,
            arrival: `${TRAVEL_DATE} 19:05`,
            stops: "Non-stop",
            price: "200",
            segments: [
              {
                from: "ORD",
                to: "SFO",
                departure: `${TRAVEL_DATE} 17:10`,
                airline: "UA",
                flight_number: "100",
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("{}", { status: 404 });
};

afterAll(() => {
  delete process.env["AERODATABOX_RAPIDAPI_KEY"];
  delete process.env["AERODATABOX_ENABLED"];
  delete process.env["AERODATABOX_MIN_INTERVAL_MS"];
  delete process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"];
  delete process.env["GOOGLE_FLIGHTS8_ENABLED"];
});

type WatchFixture = {
  id: string;
  origin: string;
  dest: string;
  flightLabel: string;
  row: Record<string, unknown>;
};

function makeWatch(i: number): WatchFixture {
  const origin = AIRPORTS[i % AIRPORTS.length]!;
  const flightLabel = FLIGHTS[i % FLIGHTS.length]!;
  const dest = "SFO";
  const optionId = `opt-${i}`;
  const planId = `plan-${i}`;
  const watchId = `watch-${i}`;
  const option = {
    id: optionId,
    plan_id: planId,
    rank: 1,
    kind: "nonstop",
    label: "mixed",
    confidence: "medium",
    headline: "Quiet watch",
    carrier: flightLabel.slice(0, 2),
    flight_number: flightLabel.slice(2),
    flight_label: flightLabel,
    origin_iata: origin,
    dest_iata: dest,
    dep_local: "5:10 PM",
    arr_local: "7:05 PM",
    sched_dep_utc: `${TRAVEL_DATE}T22:10:00Z`,
    pillars: [{ key: "operations", state: "good", title: "Operations", detail: "Clear" }],
    reasons: [],
    segments: [],
    recovery: {
      state: "unknown",
      label: "Unknown",
      summary: "",
      hoursRemaining: null,
      laterNonstops: [],
      alternates: [],
    },
    evidence: {
      availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
      conditions: null,
      history: null,
      holiday: null,
    },
    refreshed_at: new Date().toISOString(),
    is_current: true,
    staff_eligibility: "eligible",
    operator_verification: {
      status: "verified",
      checkedAt: new Date().toISOString(),
      source: "aerodatabox",
      note: null,
    },
  };

  const row = {
    id: watchId,
    user_id: USER_ID,
    plan_option_id: optionId,
    plan_id: planId,
    state: "active",
    verdict: "steady",
    unseen_changes: 0,
    snapshot: {
      judgment: "mixed",
      pillars: { operations: "good" },
      largestShowing: 2,
      laterCount: 0,
      flightState: "operating",
      primaryOptionId: optionId,
      preferredOptionId: optionId,
      backupRunwayCount: 0,
    },
    plan_options: option,
    plans: {
      id: planId,
      origin_iata: origin,
      dest_iata: dest,
      travel_date: TRAVEL_DATE,
      travelers: 1,
      cabin: "any",
      primary_option_id: optionId,
      prefs: {
        carriers: ["UA"],
        maxStops: 1,
        nearby: false,
        routingMode: "best",
      },
    },
  };

  return { id: watchId, origin, dest, flightLabel, row };
}

function createMultiWatchClient(watches: WatchFixture[]) {
  const byId = new Map(watches.map((w) => [w.id, w]));
  const optionsByPlan = new Map<string, Record<string, unknown>[]>();
  for (const w of watches) {
    const planId = String(w.row["plan_id"]);
    optionsByPlan.set(planId, [w.row["plan_options"] as Record<string, unknown>]);
  }

  return {
    from: (table: string) => {
      if (table === "watch_plans") {
        return {
          select: () => ({
            eq: (col: string, id: string) => ({
              eq: () => ({
                maybeSingle: () => {
                  const w = byId.get(id);
                  return Promise.resolve({ data: w?.row ?? null, error: null });
                },
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              const w = byId.get(id);
              if (w) {
                if (payload["snapshot"]) w.row["snapshot"] = payload["snapshot"];
                if (payload["unseen_changes"] !== undefined) {
                  w.row["unseen_changes"] = payload["unseen_changes"];
                }
                if (payload["verdict"]) w.row["verdict"] = payload["verdict"];
              }
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "plan_options") {
        return {
          select: () => ({
            eq: (col: string, val: string) => {
              if (col === "plan_id") {
                const allRows = () => optionsByPlan.get(val) ?? [];
                const currentRows = () => allRows().filter((o) => o["is_current"] !== false);
                const response = Promise.resolve({ data: allRows(), error: null });
                return Object.assign(response, {
                  eq: () => {
                    const current = Promise.resolve({ data: currentRows(), error: null });
                    return Object.assign(current, {
                      order: () => Promise.resolve({ data: currentRows(), error: null }),
                    });
                  },
                  order: () => Promise.resolve({ data: currentRows(), error: null }),
                });
              }
              return {
                eq: () => ({
                  maybeSingle: () => {
                    for (const w of watches) {
                      const opt = w.row["plan_options"] as Record<string, unknown>;
                      if (opt["id"] === val) return Promise.resolve({ data: opt });
                    }
                    return Promise.resolve({ data: null });
                  },
                }),
              };
            },
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
            in: () => Promise.resolve({ data: null, error: null }),
          }),
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: () => {
                const row = { ...payload, id: `opt-new-${Math.random()}` };
                return Promise.resolve({ data: row, error: null });
              },
            }),
          }),
        };
      }
      if (table === "plans") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { travelers: 1 }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      }
      if (table === "reported_loads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "plan_change_events") {
        return { insert: () => Promise.resolve({ data: null, error: null }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const { gatherWatchSignals } = await import("@/lib/aircue/watch-signals.server");
const { recheckWatch } = await import("@/lib/aircue/plan.server");
const { preferredBoardWindow, fidsCacheKey } = await import("@/lib/aircue/fids-cache-key");

async function plantInitializedSignalState(watches: WatchFixture[]) {
  // One dry gather per unique (origin, flight) to build matching signalState, then clear cache.
  const templates = new Map<string, WatchSignalState>();
  for (const w of watches) {
    const key = `${w.origin}:${w.flightLabel}`;
    if (templates.has(key)) continue;
    const opt = w.row["plan_options"] as Record<string, unknown>;
    const anchor = {
      id: String(opt["id"]),
      planId: String(opt["plan_id"]),
      flightLabel: w.flightLabel,
      carrier: w.flightLabel.slice(0, 2),
      flightNumber: w.flightLabel.slice(2),
      origin: w.origin,
      dest: w.dest,
      depLocal: "5:10 PM",
      arrLocal: "7:05 PM",
      schedDepUtc: `${TRAVEL_DATE}T22:10:00Z`,
      judgment: "mixed" as const,
      pillars: [{ key: "operations" as const, state: "good" as const, label: "Ops", detail: "ok" }],
      segments: [],
      evidence: {
        availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
        conditions: null,
        history: null,
        holiday: null,
        recovery: {
          state: "unknown" as const,
          label: "Unknown",
          summary: "",
          hoursRemaining: null,
          laterNonstops: [],
          alternates: [],
        },
      },
      staffEligibility: "eligible" as const,
      operatorVerification: {
        status: "verified" as const,
        checkedAt: new Date().toISOString(),
        source: "aerodatabox",
        note: null,
      },
    };
    const gathered = await gatherWatchSignals({
      origin: w.origin,
      dest: w.dest,
      travelDate: TRAVEL_DATE,
      planId: String(w.row["plan_id"]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anchor: anchor as any,
      hoursUntilDeparture: 72,
      prev: null,
      now: new Date(`${TRAVEL_DATE}T10:00:00Z`),
    });
    templates.set(
      key,
      stampRankOnSignals(gathered.signals, "bootstrap", 72, new Date(`${TRAVEL_DATE}T10:00:00Z`)),
    );
  }

  clearCache();
  resetProviderUsage();
  fetchCalls = [];

  for (const w of watches) {
    const key = `${w.origin}:${w.flightLabel}`;
    const signalState = templates.get(key)!;
    const snap = w.row["snapshot"] as Record<string, unknown>;
    w.row["snapshot"] = { ...snap, signalState, flightState: "operating" };
  }
}

function uniqueExpectedFidsKeys(watches: WatchFixture[]): Set<string> {
  const keys = new Set<string>();
  for (const w of watches) {
    const window = preferredBoardWindow(TRAVEL_DATE, "17:10");
    keys.add(fidsCacheKey(w.origin, TRAVEL_DATE, window.start, window.end));
  }
  return keys;
}

function uniqueExpectedFlights(watches: WatchFixture[]): Set<string> {
  return new Set(watches.map((w) => w.flightLabel));
}

beforeEach(() => {
  clearCache();
  resetProviderUsage();
  fetchCalls = [];
  statusOverrides.clear();
});

describe("Watch economics integration (S0–S4)", () => {
  it("100 quiet watches × 2 cycles: shared FIDS/status, zero GF8/rerank/verify", async () => {
    const watches = Array.from({ length: 100 }, (_, i) => makeWatch(i));
    await plantInitializedSignalState(watches);

    const expectedFids = uniqueExpectedFidsKeys(watches);
    const expectedFlights = uniqueExpectedFlights(watches);
    expect(expectedFids.size).toBe(AIRPORTS.length);
    expect(expectedFlights.size).toBe(FLIGHTS.length);

    const client = createMultiWatchClient(watches);
    resetProviderUsage();
    fetchCalls = [];

    const outcomes: string[] = [];
    let cycles = 0;
    let reranks = 0;
    let gf8Total = 0;
    let verifyTotal = 0;
    let fidsTotal = 0;
    let statusTotal = 0;

    for (let cycle = 0; cycle < 2; cycle++) {
      for (const w of watches) {
        const before = snapshotProviderUsage();
        const result = await recheckWatch(client, USER_ID, w.id);
        const delta = {
          gf8: (result.metrics?.gf8Calls ?? 0),
          fids: (result.metrics?.adbFidsUpstream ?? 0),
          status: (result.metrics?.adbStatusUpstream ?? 0),
          verify: (result.metrics?.operatorVerifyAttempts ?? 0),
        };
        // Cross-check return metrics against process counters.
        const processDelta = {
          gf8: snapshotProviderUsage().gf8Upstream - before.gf8Upstream,
          fids: snapshotProviderUsage().adbFidsUpstream - before.adbFidsUpstream,
          status: snapshotProviderUsage().adbStatusUpstream - before.adbStatusUpstream,
          verify: snapshotProviderUsage().operatorVerifyAttempts - before.operatorVerifyAttempts,
        };
        expect(delta.gf8).toBe(processDelta.gf8);
        expect(delta.fids).toBe(processDelta.fids);
        expect(delta.status).toBe(processDelta.status);
        expect(delta.verify).toBe(processDelta.verify);

        cycles += 1;
        outcomes.push(result.outcome ?? "none");
        if (result.outcome === "rerank") reranks += 1;
        gf8Total += delta.gf8;
        verifyTotal += delta.verify;
        fidsTotal += delta.fids;
        statusTotal += delta.status;
      }
    }

    const usage = snapshotProviderUsage();
    const adbFidsFetches = fetchCalls.filter(
      (c) => c.host.includes("aerodatabox") && c.url.includes("/flights/airports/iata/"),
    ).length;
    const adbStatusFetches = fetchCalls.filter(
      (c) => c.host.includes("aerodatabox") && c.url.includes("/flights/number/"),
    ).length;
    const gf8Fetches = fetchCalls.filter((c) => c.host.includes("google-flights8")).length;

    const report = {
      cycles,
      outcomes: {
        skip: outcomes.filter((o) => o === "skip").length,
        notifyOnly: outcomes.filter((o) => o === "notify-only").length,
        rerank: outcomes.filter((o) => o === "rerank").length,
      },
      reranks,
      gf8Upstream: usage.gf8Upstream,
      gf8Fetches,
      gf8TotalFromMetrics: gf8Total,
      operatorVerifyAttempts: usage.operatorVerifyAttempts,
      verifyTotalFromMetrics: verifyTotal,
      adbFidsUpstream: usage.adbFidsUpstream,
      adbFidsFetches,
      fidsTotalFromMetrics: fidsTotal,
      expectedUniqueFidsKeys: expectedFids.size,
      adbStatusUpstream: usage.adbStatusUpstream,
      adbStatusFetches,
      statusTotalFromMetrics: statusTotal,
      expectedUniqueFlights: expectedFlights.size,
    };
    console.info(JSON.stringify({ type: "econ_quiet_report", ...report }));

    expect(cycles).toBe(200);
    expect(reranks).toBe(0);
    expect(report.outcomes.rerank).toBe(0);
    expect(usage.gf8Upstream).toBe(0);
    expect(gf8Fetches).toBe(0);
    expect(usage.operatorVerifyAttempts).toBe(0);
    expect(usage.adbFidsUpstream).toBe(expectedFids.size);
    expect(adbFidsFetches).toBe(expectedFids.size);
    expect(usage.adbStatusUpstream).toBe(expectedFlights.size);
    expect(adbStatusFetches).toBe(expectedFlights.size);
    // Second cycle must be cache hits — totals equal unique keys, not 200.
    expect(usage.adbFidsUpstream).toBeLessThan(watches.length);
    expect(usage.adbStatusUpstream).toBeLessThan(watches.length);
  }, 120_000);

  it("disruption subset: only affected Plans rerank; others stay skip", async () => {
    const watches = Array.from({ length: 100 }, (_, i) => makeWatch(i));
    await plantInitializedSignalState(watches);

    // Cancel two primary flights → watches whose primary is UA100 or UA101.
    statusOverrides.set("UA100", "Cancelled");
    statusOverrides.set("UA101", "Cancelled");
    const disruptedIds = new Set(
      watches.filter((w) => w.flightLabel === "UA100" || w.flightLabel === "UA101").map((w) => w.id),
    );
    expect(disruptedIds.size).toBe(20); // 100/10 * 2

    const client = createMultiWatchClient(watches);
    resetProviderUsage();
    fetchCalls = [];

    const outcomes: Array<{ id: string; outcome: string }> = [];
    let cycles = 0;

    for (const w of watches) {
      const result = await recheckWatch(client, USER_ID, w.id);
      cycles += 1;
      outcomes.push({ id: w.id, outcome: result.outcome ?? "none" });
    }

    const reranked = outcomes.filter((o) => o.outcome === "rerank").map((o) => o.id);
    const skipped = outcomes.filter((o) => o.outcome === "skip" || o.outcome === "notify-only");
    const usage = snapshotProviderUsage();
    const gf8Fetches = fetchCalls.filter((c) => c.host.includes("google-flights8")).length;

    const report = {
      cycles,
      disruptedWatchCount: disruptedIds.size,
      rerankedCount: reranked.length,
      rerankedIds: reranked.sort(),
      skipOrNotifyCount: skipped.length,
      gf8Upstream: usage.gf8Upstream,
      gf8Fetches,
      operatorVerifyAttempts: usage.operatorVerifyAttempts,
      adbFidsUpstream: usage.adbFidsUpstream,
      adbStatusUpstream: usage.adbStatusUpstream,
      unexpectedReranks: reranked.filter((id) => !disruptedIds.has(id)),
      missingReranks: [...disruptedIds].filter((id) => !reranked.includes(id)),
    };
    console.info(JSON.stringify({ type: "econ_disruption_report", ...report }));

    expect(cycles).toBe(100);
    expect(report.unexpectedReranks).toEqual([]);
    expect(report.missingReranks).toEqual([]);
    expect(reranked.length).toBe(disruptedIds.size);
    expect(skipped.length).toBe(100 - disruptedIds.size);
    // Reranks must have attempted GF8 (ranking stub calls real GF8 helpers).
    expect(usage.gf8Upstream).toBeGreaterThan(0);
    expect(gf8Fetches).toBe(usage.gf8Upstream);
    // GF8 must not scale with all 100 watches — only disrupted OD work.
    expect(usage.gf8Upstream).toBeLessThan(100);
  }, 120_000);
});
