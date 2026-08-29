/**
 * recheckWatch integration tests — acceptance cases for Feature #1 that need
 * mocked provider + ranking + DB, not just pure helpers.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { FlightStatus } from "@/lib/aircue/flight-provider.server";
import type { RankedOption } from "@/lib/aircue/ranking.server";
import { isTravelDayWatchOver } from "@/lib/aircue/watch-flight-state.server";

const WATCH_ID = "watch-1";
const USER_ID = "user-1";
const PLAN_ID = "plan-1";
const OPTION_ID = "opt-1";

let watchStatusResult: { status: FlightStatus | null; unavailable: boolean } = {
  status: { state: "scheduled", label: "On schedule" },
  unavailable: false,
};
let rankedOptions: RankedOption[] = [];
const insertedEvents: Array<Record<string, unknown>> = [];
let lastWatchUpdate: Record<string, unknown> | null = null;
let lastRankInput: Record<string, unknown> | null = null;
let optionUpdateCount = 0;

const baseRecovery = {
  state: "unknown" as const,
  label: "Unknown",
  summary: "",
  hoursRemaining: null,
  laterNonstops: [] as Array<{ flightLabel: string; depLocal: string }>,
  alternates: [],
};

function makeRankedOption(overrides: Partial<RankedOption> = {}): RankedOption {
  return {
    rank: 1,
    kind: "nonstop",
    judgment: "mixed",
    confidence: "medium",
    score: 50,
    headline: "Test headline",
    carrier: "UA",
    flightNumber: "782",
    flightLabel: "UA782",
    origin: "ORD",
    dest: "SFO",
    depLocal: "5:10 PM",
    arrLocal: "7:05 PM",
    schedDepUtc: "2026-08-29T22:10:00Z",
    schedArrUtc: null,
    segments: [],
    pillars: [{ key: "operations", state: "good", title: "Operations", detail: "Clear" }],
    reasons: [],
    recovery: { ...baseRecovery, laterNonstops: [{ flightLabel: "UA900", depLocal: "8:00 PM" }] },
    evidence: {
      availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
      conditions: null,
      history: null,
      holiday: null,
    },
    ...overrides,
  };
}

function makeWatchRow(snapshot: Record<string, unknown> = {}) {
  return {
    id: WATCH_ID,
    user_id: USER_ID,
    plan_option_id: OPTION_ID,
    plan_id: PLAN_ID,
    state: "active",
    verdict: "steady",
    unseen_changes: 0,
    snapshot: {
      judgment: "mixed",
      pillars: { operations: "good" },
      largestShowing: 2,
      laterCount: 1,
      flightState: "operating",
      ...snapshot,
    },
    plan_options: {
      id: OPTION_ID,
      plan_id: PLAN_ID,
      rank: 1,
      kind: "nonstop",
      label: "mixed",
      confidence: "medium",
      headline: "Original headline",
      carrier: "UA",
      flight_number: "782",
      flight_label: "UA782",
      origin_iata: "ORD",
      dest_iata: "SFO",
      dep_local: "5:10 PM",
      arr_local: "7:05 PM",
      sched_dep_utc: "2026-08-29T22:10:00Z",
      pillars: [{ key: "operations", state: "good", title: "Operations", detail: "Clear" }],
      reasons: [],
      segments: [],
      recovery: baseRecovery,
      evidence: {
        availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
        conditions: null,
        history: null,
        holiday: null,
      },
      refreshed_at: new Date().toISOString(),
    },
    plans: {
      id: PLAN_ID,
      origin_iata: "ORD",
      dest_iata: "SFO",
      travel_date: "2026-08-29",
      travelers: 1,
      cabin: "any",
      primary_option_id: OPTION_ID,
      prefs: {
        carriers: ["UA"],
        maxStops: 1,
        nearby: false,
        routingMode: "best",
      },
    },
  };
}

function createMockClient(watchRow: ReturnType<typeof makeWatchRow>) {
  return {
    from: (table: string) => {
      if (table === "watch_plans") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: watchRow, error: null }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => {
              lastWatchUpdate = payload;
              if (payload["snapshot"]) watchRow.snapshot = payload["snapshot"] as typeof watchRow.snapshot;
              if (payload["unseen_changes"] !== undefined) {
                watchRow.unseen_changes = payload["unseen_changes"] as number;
              }
              if (payload["verdict"]) watchRow.verdict = payload["verdict"] as string;
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      if (table === "plan_options") {
        return {
          select: () => ({
            eq: (col: string) => {
              if (col === "plan_id") {
                return Promise.resolve({
                  data: [watchRow.plan_options],
                });
              }
              return {
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: watchRow.plan_options }),
                }),
              };
            },
          }),
          update: () => ({
            eq: () => {
              optionUpdateCount += 1;
              return Promise.resolve({ data: null, error: null });
            },
          }),
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: watchRow.plan_options, error: null }),
            }),
          }),
        };
      }
      if (table === "plans") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      }
      if (table === "plan_change_events") {
        return {
          insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
            insertedEvents.push(...(Array.isArray(rows) ? rows : [rows]));
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

mock.module("@/lib/aircue/flight-provider.server", () => ({
  getFlightProvider: () => ({
    name: "mock",
    live: true,
    getWatchStatus: async () => watchStatusResult,
  }),
}));

mock.module("@/lib/aircue/ranking.server", () => ({
  rankStandbyOptions: async (input: Record<string, unknown>) => {
    lastRankInput = input;
    return {
      options: rankedOptions,
      reason: rankedOptions.length ? null : "data_unavailable",
      scanned: { origins: ["ORD"], dests: ["SFO"] },
      gateways: [],
      nonstopCount: rankedOptions.length,
    };
  },
}));

const { recheckWatch } = await import("@/lib/aircue/plan.server");

function cancelKinds() {
  return insertedEvents.filter((e) => e["kind"] === "flight_cancelled");
}

beforeEach(() => {
  insertedEvents.length = 0;
  lastWatchUpdate = null;
  lastRankInput = null;
  optionUpdateCount = 0;
  watchStatusResult = { status: { state: "scheduled", label: "On schedule" }, unavailable: false };
  rankedOptions = [makeRankedOption()];
});

afterEach(() => {
  watchStatusResult = { status: { state: "scheduled", label: "On schedule" }, unavailable: false };
  rankedOptions = [makeRankedOption()];
});

describe("recheckWatch cancellation integration", () => {
  it("1. scheduled → cancelled produces exactly one meaningful flight_cancelled event", async () => {
    watchStatusResult = { status: { state: "cancelled", label: "Cancelled" }, unavailable: false };
    const client = createMockClient(makeWatchRow({ flightState: "operating" }));

    const result = await recheckWatch(client, USER_ID, WATCH_ID);

    expect(result.changed).toBe(true);
    expect(cancelKinds()).toHaveLength(1);
    expect(cancelKinds()[0]?.["severity"]).toBe("meaningful");
  });

  it("2. cancelled → cancelled does not duplicate the event", async () => {
    watchStatusResult = { status: { state: "cancelled", label: "Cancelled" }, unavailable: false };
    const client = createMockClient(makeWatchRow({ flightState: "cancelled" }));

    const result = await recheckWatch(client, USER_ID, WATCH_ID);

    expect(result.changed).toBe(false);
    expect(cancelKinds()).toHaveLength(0);
  });

  it("3. API failure → no cancellation event", async () => {
    watchStatusResult = { status: null, unavailable: true };
    rankedOptions = [];
    const client = createMockClient(makeWatchRow());

    await recheckWatch(client, USER_ID, WATCH_ID);

    expect(cancelKinds()).toHaveLength(0);
    expect(lastWatchUpdate?.["next_check_at"]).toBeDefined();
    expect(lastWatchUpdate?.["last_checked_at"]).toBeDefined();
  });

  it("4. ranking miss + status scheduled → no cancellation event", async () => {
    watchStatusResult = { status: { state: "scheduled", label: "On schedule" }, unavailable: false };
    rankedOptions = [];
    const client = createMockClient(makeWatchRow());

    await recheckWatch(client, USER_ID, WATCH_ID);

    expect(cancelKinds()).toHaveLength(0);
    expect((lastWatchUpdate?.["snapshot"] as { flightState: string }).flightState).toBe("operating");
    expect(lastWatchUpdate?.["next_check_at"]).toBeDefined();
    expect(lastRankInput?.["origin"]).toBe("ORD");
    expect(lastRankInput?.["maxStops"]).toBe(1);
  });

  it("recheck uses plan prefs from plans row", async () => {
    const client = createMockClient(makeWatchRow());
    await recheckWatch(client, USER_ID, WATCH_ID);
    expect(lastRankInput?.["routingMode"]).toBe("best");
    expect(lastRankInput?.["nearby"]).toBe(false);
    expect(lastRankInput?.["carriers"]).toEqual(["UA"]);
  });

  it("5. ranking miss + status unavailable → no cancellation event", async () => {
    watchStatusResult = { status: null, unavailable: true };
    rankedOptions = [];
    const client = createMockClient(makeWatchRow({ flightState: "operating" }));

    await recheckWatch(client, USER_ID, WATCH_ID);

    expect(cancelKinds()).toHaveLength(0);
    expect((lastWatchUpdate?.["snapshot"] as { flightState: string }).flightState).toBe("operating");
  });

  it("9. availability zero while scheduled → no cancellation event", async () => {
    watchStatusResult = { status: { state: "scheduled", label: "On schedule" }, unavailable: false };
    rankedOptions = [
      makeRankedOption({
        evidence: {
          availability: { checked: true, tested: [], largestShowing: 0, checkedAt: null },
          conditions: null,
          history: null,
          holiday: null,
        },
      }),
    ];
    const client = createMockClient(makeWatchRow());

    await recheckWatch(client, USER_ID, WATCH_ID);

    expect(cancelKinds()).toHaveLength(0);
    expect(insertedEvents.some((e) => e["kind"] === "availability")).toBe(true);
  });

  it("11. status recovers after temporary failure and watch resumes", async () => {
    const watchRow = makeWatchRow({ flightState: "operating" });
    const client = createMockClient(watchRow);

    watchStatusResult = { status: null, unavailable: true };
    rankedOptions = [];
    await recheckWatch(client, USER_ID, WATCH_ID);
    expect(cancelKinds()).toHaveLength(0);
    expect((lastWatchUpdate?.["snapshot"] as { flightState: string }).flightState).toBe("operating");

    insertedEvents.length = 0;
    watchStatusResult = { status: { state: "scheduled", label: "On schedule" }, unavailable: false };
    rankedOptions = [makeRankedOption()];
    const result = await recheckWatch(client, USER_ID, WATCH_ID);

    expect(result.changed).toBe(false);
    expect(cancelKinds()).toHaveLength(0);
    expect((lastWatchUpdate?.["snapshot"] as { flightState: string }).flightState).toBe("operating");
    expect(optionUpdateCount).toBe(1);
  });

  it("12. cancellation increments unseen_changes once and sets verdict to changed", async () => {
    watchStatusResult = { status: { state: "cancelled", label: "Cancelled" }, unavailable: false };
    const client = createMockClient(makeWatchRow({ flightState: "operating" }));

    await recheckWatch(client, USER_ID, WATCH_ID);

    expect(lastWatchUpdate?.["unseen_changes"]).toBe(1);
    expect(lastWatchUpdate?.["verdict"]).toBe("changed");
  });
});

describe("isTravelDayWatchOver", () => {
  it("10. past travel day is over — cron should end watch without rechecking", () => {
    const now = new Date("2026-08-29T06:01:00Z");
    expect(isTravelDayWatchOver("2026-08-28", now)).toBe(true);
    expect(isTravelDayWatchOver("2026-08-29", now)).toBe(false);
  });
});
