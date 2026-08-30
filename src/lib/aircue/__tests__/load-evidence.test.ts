import { describe, expect, it } from "bun:test";

import {
  computeLoadEvidence,
  cushionScoreAdjustment,
  loadPillarFromEvidence,
} from "@/lib/aircue/load-evidence";
import type { ReportedLoad } from "@/lib/aircue/standby";

const NOW = Date.parse("2026-09-01T12:00:00Z");

function load(overrides: Partial<ReportedLoad>): ReportedLoad {
  return {
    id: "load-1",
    segmentKey: "UA123:ORD-DEN:2026-09-01T10:00",
    flightLabel: "UA123",
    openSeats: 8,
    standbys: 3,
    cabin: "economy",
    source: "employee_system",
    partyIncluded: "no",
    checkedAt: new Date(NOW - 5 * 60_000).toISOString(),
    ...overrides,
  };
}

describe("computeLoadEvidence null handling", () => {
  it("8 open / null listed stays unknown cushion", () => {
    const evidence = computeLoadEvidence(
      load({ openSeats: 8, standbys: null, partyIncluded: "yes" }),
      { partySize: 1 },
    );
    expect(evidence.effectiveListed).toBeNull();
    expect(evidence.cushion).toBeNull();
    const pillar = loadPillarFromEvidence(evidence);
    expect(pillar.state).toBe("unknown");
    expect(pillar.label).toBe("Partial");
    expect(pillar.detail).toContain("standby count unavailable");
    expect(pillar.detail).not.toContain("Strong");
  });

  it("8 open / null listed / party=4 does not invent zero listed demand", () => {
    const evidence = computeLoadEvidence(
      load({ openSeats: 8, standbys: null, partyIncluded: "no" }),
      { partySize: 4 },
    );
    expect(evidence.effectiveListed).toBeNull();
    expect(evidence.cushion).toBeNull();
    expect(loadPillarFromEvidence(evidence).state).toBe("unknown");
  });

  it("partyIncluded unsure keeps cushion unknown even with open and listed", () => {
    const evidence = computeLoadEvidence(
      load({ openSeats: 8, standbys: 3, partyIncluded: "unsure" }),
      { partySize: 4 },
    );
    expect(evidence.effectiveListed).toBeNull();
    expect(evidence.cushion).toBeNull();
    expect(loadPillarFromEvidence(evidence).label).toBe("Partial");
  });

  it("null open / 3 listed / party not included counts party size", () => {
    const evidence = computeLoadEvidence(
      load({ openSeats: null, standbys: 3, partyIncluded: "no" }),
      { partySize: 1 },
    );
    expect(evidence.effectiveListed).toBe(4);
    expect(evidence.cushion).toBeNull();
    expect(loadPillarFromEvidence(evidence).state).toBe("unknown");
  });

  it("8 open / 0 explicitly listed is valid zero demand", () => {
    const evidence = computeLoadEvidence(
      load({ openSeats: 8, standbys: 0, partyIncluded: "yes" }),
      { partySize: 1 },
    );
    expect(evidence.effectiveListed).toBe(0);
    expect(evidence.cushion).toBe(8);
    expect(loadPillarFromEvidence(evidence).state).toBe("good");
    expect(loadPillarFromEvidence(evidence).label).toBe("Strong");
  });
});

describe("cushionScoreAdjustment", () => {
  it("caps extreme positive cushion at +12 before freshness", () => {
    expect(cushionScoreAdjustment(20, 1)).toBe(12);
    expect(cushionScoreAdjustment(20, 1)).toBeLessThan(Math.round(20 * 1.5));
  });

  it("caps extreme negative cushion at -12 before freshness", () => {
    expect(cushionScoreAdjustment(-15, 1)).toBe(-12);
  });

  it("applies freshness multiplier after capping", () => {
    const fresh = cushionScoreAdjustment(20, 1);
    const stale = cushionScoreAdjustment(20, 0.35);
    expect(stale).toBeLessThan(fresh);
    expect(stale).toBe(Math.round(12 * 0.35));
  });

  it("returns zero when cushion is unknown", () => {
    expect(cushionScoreAdjustment(null, 1)).toBe(0);
  });
});
