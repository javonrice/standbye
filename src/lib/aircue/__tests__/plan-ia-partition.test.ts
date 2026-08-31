import { describe, expect, it } from "bun:test";

import {
  isCommittedPlanSummary,
  partitionPlanSummaries,
} from "@/lib/aircue/plan.server";
import type { PlanSummary } from "@/lib/aircue/plan.functions";

function summary(partial: Partial<PlanSummary> & Pick<PlanSummary, "id">): PlanSummary {
  return {
    origin: "ORD",
    dest: "CMH",
    travelDate: "2026-09-01",
    travelers: 1,
    bestJudgment: "favorable",
    optionCount: 3,
    createdAt: "2026-08-29T00:00:00.000Z",
    mode: "standby",
    watching: false,
    planVerdict: null,
    lastCheckedAt: null,
    primaryFlightLabel: null,
    hasPrimary: false,
    backupRunwaySummary: "3 realistic ways remain",
    lifecycleStatus: "active",
    isActionable: true,
    ...partial,
  };
}

describe("plan information architecture partition", () => {
  it("puts uncommitted searches (no primary, no watch) in recent only", () => {
    const search = summary({ id: "recent-1", hasPrimary: false, watching: false });
    const { committed, recent } = partitionPlanSummaries([search]);
    expect(isCommittedPlanSummary(search)).toBe(false);
    expect(recent.map((p) => p.id)).toEqual(["recent-1"]);
    expect(committed).toEqual([]);
  });

  it("qualifies a plan with primary and no watch for Plans", () => {
    const plan = summary({
      id: "primary-1",
      hasPrimary: true,
      watching: false,
      primaryFlightLabel: "UA 3612",
    });
    const { committed, recent } = partitionPlanSummaries([plan]);
    expect(isCommittedPlanSummary(plan)).toBe(true);
    expect(committed.map((p) => p.id)).toEqual(["primary-1"]);
    expect(recent).toEqual([]);
  });

  it("qualifies a watched plan with no primary for Plans", () => {
    const plan = summary({
      id: "watch-only",
      hasPrimary: false,
      watching: true,
      planVerdict: "steady",
    });
    const { committed, recent } = partitionPlanSummaries([plan]);
    expect(committed.map((p) => p.id)).toEqual(["watch-only"]);
    expect(recent).toEqual([]);
  });

  it("lists a primary+watched plan only once in Plans", () => {
    const plan = summary({
      id: "both",
      hasPrimary: true,
      watching: true,
      primaryFlightLabel: "UA 343",
      planVerdict: "steady",
    });
    const { committed, recent } = partitionPlanSummaries([plan]);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.id).toBe("both");
    expect(recent).toHaveLength(0);
  });

  it("keeps a plan in Plans after unwatch when primary remains", () => {
    const afterUnwatch = summary({
      id: "kept",
      hasPrimary: true,
      watching: false,
      primaryFlightLabel: "UA 3612",
    });
    expect(isCommittedPlanSummary(afterUnwatch)).toBe(true);
    const { committed, recent } = partitionPlanSummaries([afterUnwatch]);
    expect(committed.map((p) => p.id)).toEqual(["kept"]);
    expect(recent).toEqual([]);
  });

  it("does not duplicate the same plan across Recent and Plans", () => {
    const all = [
      summary({ id: "a", hasPrimary: false, watching: false }),
      summary({ id: "b", hasPrimary: true, watching: false, primaryFlightLabel: "UA1" }),
      summary({ id: "c", hasPrimary: false, watching: true }),
      summary({
        id: "d",
        hasPrimary: true,
        watching: true,
        primaryFlightLabel: "UA2",
      }),
    ];
    const { committed, recent } = partitionPlanSummaries(all);
    const committedIds = committed.map((p) => p.id);
    const recentIds = recent.map((p) => p.id);
    expect(committedIds).toEqual(["b", "c", "d"]);
    expect(recentIds).toEqual(["a"]);
    expect(committedIds.filter((id) => recentIds.includes(id))).toEqual([]);
  });
});

describe("primary selection does not imply watch", () => {
  it("treats primary-only plans as committed but not watching", () => {
    const plan = summary({
      id: "primary-no-watch",
      hasPrimary: true,
      watching: false,
      primaryFlightLabel: "UA 3612",
    });
    expect(isCommittedPlanSummary(plan)).toBe(true);
    expect(plan.watching).toBe(false);
  });
});
