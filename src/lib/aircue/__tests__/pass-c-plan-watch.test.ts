/**
 * Pass C — access-aware runway, composition events, coverage-noise guard, operator verify mapping.
 */
import { describe, expect, it, mock } from "bun:test";

import {
  computeBackupRunway,
  detectAnchorOptionEvents,
  detectPlanChangeEvents,
  type PlanWatchSnapshot,
} from "@/lib/aircue/plan-watch-events.server";
import { resolveStaffEligibility } from "@/lib/aircue/staff-eligibility";
import type { StandbyOption } from "@/lib/aircue/standby";

function option(partial: Partial<StandbyOption> & { id: string; flightLabel: string }): StandbyOption {
  return {
    planId: "plan-1",
    rank: 1,
    kind: "nonstop",
    judgment: "mixed",
    confidence: "medium",
    headline: "h",
    optionKey: null,
    carrier: "UA",
    flightNumber: "1",
    origin: "ORD",
    dest: "SFO",
    depLocal: "1:00 PM",
    arrLocal: "3:00 PM",
    schedDepUtc: null,
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
    access: "home",
    staffEligibility: "uncertain",
    operatorVerification: { status: "unverified", checkedAt: null, source: null, note: null },
    standbyClears: 1,
    commercialFare: null,
    ...partial,
  };
}

describe("access-aware runway", () => {
  it("excludes ineligible from staff-travel runway counts", () => {
    const options = [
      option({ id: "a", flightLabel: "UA1", access: "home", staffEligibility: "uncertain" }),
      option({ id: "b", flightLabel: "LH1", access: "zed", staffEligibility: "uncertain" }),
      option({
        id: "c",
        flightLabel: "BA1",
        access: "other",
        staffEligibility: "ineligible",
      }),
    ];
    const runway = computeBackupRunway(options, "a", { homeAirline: "UA" });
    expect(runway.totalRealisticWays).toBe(2);
    expect(runway.backupAlternatives).toBe(1);
    expect(runway.homeCount).toBe(1);
    expect(runway.zedCount).toBe(1);
    expect(runway.otherCount).toBe(0);
    expect(runway.summary).toContain("United");
    expect(runway.summary).toContain("Home");
    expect(runway.summary).toContain("ZED");
  });

  it("uses dynamic your-airline copy for non-UA home", () => {
    const options = [option({ id: "a", flightLabel: "DL1", access: "home", carrier: "DL" })];
    const runway = computeBackupRunway(options, "a", { homeAirline: "DL" });
    expect(runway.summary.toLowerCase()).toContain("delta");
  });
});

describe("access composition events", () => {
  it("emits when home options leave the runway", () => {
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: {},
      largestShowing: 2,
      laterCount: 1,
      backupRunwayCount: 2,
      accessHomeCount: 2,
      accessZedCount: 1,
      accessOtherCount: 0,
      primaryStaffEligibility: "uncertain",
    };
    const primary = option({ id: "z", flightLabel: "LH2", access: "zed" });
    const backup = computeBackupRunway(
      [
        option({ id: "z", flightLabel: "LH2", access: "zed" }),
        option({ id: "z2", flightLabel: "LH3", access: "zed" }),
      ],
      "z",
      { homeAirline: "UA" },
    );
    const events = detectPlanChangeEvents({
      prev,
      preferred: primary,
      primary,
      backup,
      spilloverCancelled: 0,
    });
    expect(events.some((e) => e.kind === "access_composition_changed")).toBe(true);
  });

  it("emits eligibility transition to ineligible", () => {
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: {},
      largestShowing: 2,
      laterCount: 1,
      backupRunwayCount: 1,
      accessHomeCount: 1,
      primaryStaffEligibility: "uncertain",
    };
    const primary = option({
      id: "a",
      flightLabel: "UA1",
      staffEligibility: "ineligible",
    });
    const backup = computeBackupRunway([primary], "a");
    const events = detectPlanChangeEvents({
      prev,
      preferred: primary,
      primary,
      backup,
      spilloverCancelled: 0,
    });
    expect(events.some((e) => e.kind === "primary_eligibility_changed")).toBe(true);
  });
});

describe("coverage noise guard", () => {
  it("does not emit events solely for missing FAA/history coverage", () => {
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: { operations: "unknown", history: "unknown" },
      largestShowing: 2,
      laterCount: 1,
    };
    const fresh = option({
      id: "a",
      flightLabel: "LH400",
      judgment: "mixed",
      pillars: [
        { key: "operations", state: "unknown", label: "Coverage limited", detail: "n/a" },
        { key: "history", state: "unknown", label: "Historical pattern unavailable", detail: "n/a" },
      ],
      evidence: {
        availability: { checked: false, tested: [], largestShowing: 2, checkedAt: null },
        conditions: {
          airport: "FRA",
          faa: "Live airport disruption coverage unavailable for this region",
          delays: "FAA delay programs not applicable here",
          weather: "No current observation",
          forecast: null,
          forecastState: "unknown",
          note: "Disruption feed not covered",
          faaCoverage: "not_covered",
          weatherCoverage: "unavailable",
        },
        history: {
          monthLabel: "",
          carrierLabel: "",
          summary: "Historical pattern unavailable",
          loadIndex: null,
          cancelPattern: "Low",
          delayPattern: "Low",
          sourcePeriod: null,
          historyCoverage: "not_covered",
        },
        holiday: null,
        recovery: {
          state: "fair",
          label: "Fair",
          summary: "ok",
          hoursRemaining: null,
          laterNonstops: [{ flightLabel: "LH401", depLocal: "2:00 PM", judgment: "mixed" }],
          alternates: [],
        },
      },
    });
    const events = detectAnchorOptionEvents(prev, fresh);
    expect(events).toEqual([]);
  });
});

describe("operator verify mapping (mocked ADB)", () => {
  it("maps verified outside access to ineligible without inventing failure-ineligible", async () => {
    mock.module("@/lib/aircue/aerodatabox.server", () => ({
      fetchFlightStatus: async () => ({
        flight: { airline: { iata: "BA" }, status: "Scheduled" },
        budgetBlocked: false,
      }),
      aeroDataBoxEnabled: () => true,
    }));
    // Direct table mapping stays authoritative even when ADB is mocked elsewhere.
    const outside = resolveStaffEligibility({
      allowedAccess: ["LH", "UA"],
      verifyAttempted: true,
      operatorCarriers: ["BA"],
      operatorDeterminable: true,
    });
    expect(outside.staffEligibility).toBe("ineligible");

    const failed = resolveStaffEligibility({
      allowedAccess: ["LH"],
      verifyAttempted: true,
      verifyFailed: true,
    });
    expect(failed.staffEligibility).toBe("uncertain");
  });
});
