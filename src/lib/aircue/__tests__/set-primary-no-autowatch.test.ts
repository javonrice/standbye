/**
 * setPrimaryOption must record intent without starting a watch.
 */
import { beforeEach, describe, expect, it } from "bun:test";

const USER_ID = "user-1";
const PLAN_ID = "plan-1";
const OPTION_ID = "opt-1";

const planUpdates: Array<Record<string, unknown>> = [];
const watchUpdates: Array<Record<string, unknown>> = [];
const watchInserts: Array<Record<string, unknown>> = [];
let activeWatch: Record<string, unknown> | null = null;
let optionExists = true;

function createMockClient() {
  return {
    from: (table: string) => {
      if (table === "plan_options") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: optionExists
                        ? {
                            id: OPTION_ID,
                            plan_id: PLAN_ID,
                            is_current: true,
                            user_id: USER_ID,
                            flight_label: "UA782",
                            flight_number: "782",
                            carrier: "UA",
                            origin_iata: "ORD",
                            dest_iata: "SFO",
                            label: "mixed",
                            confidence: "medium",
                            headline: "h",
                            pillars: [],
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
                              availability: {
                                checked: false,
                                tested: [],
                                largestShowing: null,
                                checkedAt: null,
                              },
                              conditions: null,
                              history: null,
                              holiday: null,
                            },
                            refreshed_at: new Date().toISOString(),
                          }
                        : null,
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      }
      if (table === "plans") {
        return {
          update: (payload: Record<string, unknown>) => {
            planUpdates.push(payload);
            return {
              eq: () => ({
                eq: () => Promise.resolve({ data: null, error: null }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      travel_date: "2026-08-29",
                      prefs: {
                        carriers: ["UA"],
                        effectiveCarriers: ["UA"],
                        accessMetaSnapshot: { UA: { type: "home" } },
                      },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      if (table === "watch_plans") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: activeWatch, error: null }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            watchUpdates.push(payload);
            return {
              eq: () => Promise.resolve({ data: null, error: null }),
            };
          },
          insert: (payload: Record<string, unknown>) => {
            watchInserts.push(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "new-watch" }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe("setPrimaryOption does not auto-watch", () => {
  beforeEach(() => {
    planUpdates.length = 0;
    watchUpdates.length = 0;
    watchInserts.length = 0;
    activeWatch = null;
    optionExists = true;
  });

  it("updates primary_option_id without inserting a watch", async () => {
    const { setPrimaryOption } = await import("@/lib/aircue/plan.server");
    await setPrimaryOption(createMockClient(), USER_ID, PLAN_ID, OPTION_ID);
    expect(planUpdates).toEqual([{ primary_option_id: OPTION_ID }]);
    expect(watchInserts).toEqual([]);
    expect(watchUpdates).toEqual([]);
  });

  it("updates an existing watch anchor without creating another watch", async () => {
    activeWatch = { id: "watch-1" };
    const { setPrimaryOption } = await import("@/lib/aircue/plan.server");
    await setPrimaryOption(createMockClient(), USER_ID, PLAN_ID, OPTION_ID);
    expect(planUpdates).toEqual([{ primary_option_id: OPTION_ID }]);
    expect(watchInserts).toEqual([]);
    expect(watchUpdates).toEqual([{ plan_option_id: OPTION_ID }]);
  });
});
