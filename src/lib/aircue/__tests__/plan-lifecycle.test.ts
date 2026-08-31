import { describe, expect, it } from "bun:test";

import type { PlanSummary } from "@/lib/aircue/plan.functions";
import type { StandbyOption, StandbyPlan } from "@/lib/aircue/standby";
import {
  applyLifecycleView,
  isOptionActionable,
  pickActionablePlan,
  resolvePlanLifecycle,
} from "@/lib/aircue/plan-lifecycle.server";

function option(
  partial: Partial<StandbyOption> & Pick<StandbyOption, "id" | "rank" | "schedDepUtc">,
): StandbyOption {
  return {
    planId: "plan-1",
    kind: "nonstop",
    judgment: "favorable",
    confidence: "medium",
    headline: "h",
    flightLabel: `UA${partial.rank}`,
    optionKey: null,
    carrier: "UA",
    flightNumber: String(partial.rank),
    origin: "ORD",
    dest: "LAX",
    depLocal: "08:00",
    arrLocal: "10:00",
    segments: [],
    pillars: [],
    reasons: [],
    evidence: {
      availability: { checked: false, tested: [], largestShowing: null, checkedAt: null },
      conditions: null,
      history: null,
      holiday: null,
      recovery: {
        state: "unknown",
        label: "Unknown",
        summary: "",
        hoursRemaining: null,
        laterNonstops: [],
        alternates: [],
      },
    },
    load: null,
    refreshedAt: new Date().toISOString(),
    staffEligibility: "eligible",
    ...partial,
  };
}

function plan(options: StandbyOption[], partial: Partial<StandbyPlan> = {}): StandbyPlan {
  return {
    id: "plan-1",
    origin: "ORD",
    dest: "LAX",
    travelDate: "2026-08-31",
    travelers: 1,
    cabin: "any",
    options,
    noStrongSetup: false,
    emptyReason: null,
    scannedAirports: { origins: ["ORD"], dests: ["LAX"] },
    gateways: [],
    strategies: [],
    strategyDiscovery: { status: "unavailable", checkedAt: null },
    routingMode: "best",
    mode: "standby",
    standbyDayShared: false,
    primaryOptionId: options[0]?.id ?? null,
    preferredOptionId: options[0]?.id ?? null,
    watching: false,
    watchId: null,
    planVerdict: null,
    lastCheckedAt: null,
    nextCheckAt: null,
    backupRunway: {
      totalRealisticWays: options.length,
      backupAlternatives: Math.max(0, options.length - 1),
      nonstops: options.length,
      connections: 0,
      summary: "",
      total: options.length,
    },
    ...partial,
  };
}

describe("resolvePlanLifecycle", () => {
  it("test 1 — advances when current option passed and future option exists", () => {
    const o1 = option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:15:00Z" });
    const o2 = option({ id: "o2", rank: 2, schedDepUtc: "2026-08-31T10:30:00Z" });
    const o3 = option({ id: "o3", rank: 3, schedDepUtc: "2026-08-31T12:00:00Z" });
    const p = plan([o1, o2, o3], { primaryOptionId: "o1", preferredOptionId: "o1" });
    const now = new Date("2026-08-31T08:49:00Z");

    const result = resolvePlanLifecycle(p, now);
    expect(result.status).toBe("active");
    expect(result.currentOptionId).toBe("o2");
    expect(result.primaryAdvanced).toBe(true);
    expect(result.newPrimaryOptionId).toBe("o2");
  });

  it("test 2 — skips multiple departed options", () => {
    const options = [
      option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:00:00Z" }),
      option({ id: "o2", rank: 2, schedDepUtc: "2026-08-31T08:30:00Z" }),
      option({ id: "o3", rank: 3, schedDepUtc: "2026-08-31T11:00:00Z" }),
      option({ id: "o4", rank: 4, schedDepUtc: "2026-08-31T13:00:00Z" }),
    ];
    const p = plan(options, { primaryOptionId: "o1" });
    const now = new Date("2026-08-31T10:00:00Z");

    const result = resolvePlanLifecycle(p, now);
    expect(result.currentOptionId).toBe("o3");
    expect(result.primaryAdvanced).toBe(true);
  });

  it("test 3 — completes when all options passed", () => {
    const options = [
      option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:00:00Z" }),
      option({ id: "o2", rank: 2, schedDepUtc: "2026-08-31T09:00:00Z" }),
    ];
    const p = plan(options, { primaryOptionId: "o1" });
    const now = new Date("2026-08-31T12:00:00Z");

    const result = resolvePlanLifecycle(p, now);
    expect(result.status).toBe("complete");
    expect(result.currentOptionId).toBeNull();
    expect(result.shouldEndWatch).toBe(true);
    expect(result.actionableOptionIds).toEqual([]);
  });

  it("test 4 — keeps current option when still future", () => {
    const o1 = option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T14:00:00Z" });
    const o2 = option({ id: "o2", rank: 2, schedDepUtc: "2026-08-31T16:00:00Z" });
    const p = plan([o1, o2], { primaryOptionId: "o1" });
    const now = new Date("2026-08-31T10:00:00Z");

    const result = resolvePlanLifecycle(p, now);
    expect(result.status).toBe("active");
    expect(result.currentOptionId).toBe("o1");
    expect(result.primaryAdvanced).toBe(false);
  });

  it("test 5 — completed plan stays complete without advance", () => {
    const o1 = option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:00:00Z" });
    const p = plan([o1], {
      primaryOptionId: "o1",
      lifecycleStatus: "complete",
      travelDate: "2026-08-31",
    });
    const result = resolvePlanLifecycle(p, new Date("2026-08-31T12:00:00Z"));
    expect(result.status).toBe("complete");
    expect(result.primaryAdvanced).toBe(false);
    expect(result.actionableOptionIds).toEqual([]);
    expect(p.travelDate).toBe("2026-08-31");
  });

  it("test 7 — skips ineligible option when advancing", () => {
    const o1 = option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:00:00Z" });
    const o2 = option({
      id: "o2",
      rank: 2,
      schedDepUtc: "2026-08-31T11:00:00Z",
      staffEligibility: "ineligible",
    });
    const o3 = option({ id: "o3", rank: 3, schedDepUtc: "2026-08-31T13:00:00Z" });
    const p = plan([o1, o2, o3], { primaryOptionId: "o1" });
    const now = new Date("2026-08-31T10:00:00Z");

    const result = resolvePlanLifecycle(p, now);
    expect(result.currentOptionId).toBe("o3");
    expect(isOptionActionable(o2, now)).toBe(false);
  });
});

describe("pickActionablePlan", () => {
  function summary(partial: Partial<PlanSummary> & Pick<PlanSummary, "id">): PlanSummary {
    return {
      origin: "ORD",
      dest: "LAX",
      travelDate: "2026-08-31",
      travelers: 1,
      bestJudgment: "favorable",
      optionCount: 2,
      createdAt: "2026-08-29T00:00:00.000Z",
      mode: "standby",
      watching: false,
      planVerdict: null,
      lastCheckedAt: null,
      primaryFlightLabel: "UA100",
      hasPrimary: true,
      backupRunwaySummary: "2 realistic ways remain",
      lifecycleStatus: "active",
      isActionable: true,
      ...partial,
    };
  }

  it("test 6 — prefers actionable tomorrow over completed today", () => {
    const todayISO = "2026-08-31";
    const plans = [
      summary({
        id: "a",
        travelDate: "2026-08-31",
        lifecycleStatus: "complete",
        isActionable: false,
      }),
      summary({
        id: "b",
        travelDate: "2026-09-01",
        lifecycleStatus: "active",
        isActionable: true,
        createdAt: "2026-08-28T00:00:00.000Z",
      }),
    ];
    expect(pickActionablePlan(plans, todayISO)?.id).toBe("b");
  });
});

describe("applyLifecycleView", () => {
  it("test 8 — read-only view updates display primary without implying DB write", () => {
    const o1 = option({ id: "o1", rank: 1, schedDepUtc: "2026-08-31T08:00:00Z" });
    const o2 = option({ id: "o2", rank: 2, schedDepUtc: "2026-08-31T11:00:00Z" });
    const stored = plan([o1, o2], { primaryOptionId: "o1" });
    const lifecycle = resolvePlanLifecycle(stored, new Date("2026-08-31T10:00:00Z"));
    const view = applyLifecycleView(stored, lifecycle);

    expect(stored.primaryOptionId).toBe("o1");
    expect(view.primaryOptionId).toBe("o2");
    expect(view.lifecycleStatus).toBe("active");
  });
});

describe("recheckWatch integration contract", () => {
  it("test 9 — recheckWatch resolves lifecycle before signal evaluation", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/aircue/plan.server.ts", "utf8");
    const recheckStart = source.indexOf("export async function recheckWatch");
    const recheckBody = source.slice(recheckStart, recheckStart + 4000);
    const lifecycleIdx = recheckBody.indexOf("resolveAndPersistPlanLifecycle");
    const signalsIdx = recheckBody.indexOf("gatherWatchSignals");
    expect(lifecycleIdx).toBeGreaterThan(0);
    expect(signalsIdx).toBeGreaterThan(lifecycleIdx);
  });
});
