import { describe, expect, it } from "bun:test";

import {
  computeBackupRunway,
  detectPlanChangeEvents,
  type PlanWatchSnapshot,
} from "@/lib/aircue/plan-watch-events.server";
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
    ...partial,
  };
}

describe("computeBackupRunway", () => {
  it("separates totalRealisticWays from backupAlternatives excluding primary", () => {
    const options = [
      option({ id: "a", flightLabel: "UA1", kind: "nonstop", rank: 1 }),
      option({ id: "b", flightLabel: "UA2", kind: "nonstop", rank: 2 }),
      option({ id: "c", flightLabel: "UA3", kind: "connection", rank: 3 }),
    ];
    const runway = computeBackupRunway(options, "a");
    expect(runway.totalRealisticWays).toBe(3);
    expect(runway.backupAlternatives).toBe(2);
    expect(runway.nonstops).toBe(2);
    expect(runway.connections).toBe(1);
    expect(runway.summary).toContain("3 realistic ways remain");
    expect(runway.total).toBe(3);
  });

  it("treats rank-1 as implicit primary when primary is unset", () => {
    const options = [
      option({ id: "a", flightLabel: "UA1", rank: 1 }),
      option({ id: "b", flightLabel: "UA2", rank: 2 }),
    ];
    const runway = computeBackupRunway(options, null);
    expect(runway.totalRealisticWays).toBe(2);
    expect(runway.backupAlternatives).toBe(1);
  });
});

describe("detectPlanChangeEvents backup shrink", () => {
  it("uses backupAlternatives for shrink thresholds, not total ways", () => {
    const primary = option({ id: "a", flightLabel: "UA1", judgment: "mixed" });
    const preferred = option({ id: "b", flightLabel: "UA2", judgment: "favorable", rank: 1 });
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: {},
      largestShowing: 2,
      laterCount: 1,
      backupRunwayCount: 3,
      preferredOptionId: "a",
      primaryOptionId: "a",
    };
    // 3 total ways, 2 backups — should NOT shrink (prev backups 3 → next 2)
    const backup = computeBackupRunway([primary, preferred, option({ id: "c", flightLabel: "UA3" })], "a");
    expect(backup.backupAlternatives).toBe(2);

    const noShrink = detectPlanChangeEvents({
      prev,
      preferred,
      primary,
      backup,
      spilloverCancelled: 0,
    });
    expect(noShrink.some((e) => e.kind === "backup_runway_shrunk")).toBe(false);

    // Drop to primary only → 0 backups → shrink
    const thin = computeBackupRunway([primary], "a");
    const shrink = detectPlanChangeEvents({
      prev,
      preferred: primary,
      primary,
      backup: thin,
      spilloverCancelled: 0,
    });
    expect(shrink.some((e) => e.kind === "backup_runway_shrunk")).toBe(true);
  });
});
