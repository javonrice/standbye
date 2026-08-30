/** Party-aware load display helpers (thin wrappers over load-evidence). */
import { describe, expect, it } from "bun:test";

import { computeLoadEvidence } from "@/lib/aircue/load-evidence";
import { judgeWithLoad, loadPillar, scoreFromPillars } from "@/lib/aircue/load-adjust";
import type { Pillar, ReportedLoad } from "@/lib/aircue/standby";

const NOW = Date.parse("2026-08-30T18:00:00.000Z");

function load(overrides: Partial<ReportedLoad> = {}): ReportedLoad {
  return {
    id: "load-1",
    segmentKey: "UA222:ORD-DEN:2026-08-30T17:45",
    flightLabel: "UA222",
    openSeats: 4,
    standbys: 3,
    cabin: "economy",
    source: "employee_system",
    checkedAt: "2026-08-30T17:45:00.000Z",
    partyIncluded: "yes",
    ...overrides,
  };
}

describe("load-adjust party semantics", () => {
  it("counts the traveller party when they are not listed yet", () => {
    const solo = computeLoadEvidence(load({ partyIncluded: "no" }), { partySize: 1, now: NOW });
    const family = computeLoadEvidence(load({ partyIncluded: "no" }), { partySize: 4, now: NOW });
    expect(solo.effectiveListed).toBe(4);
    expect(family.effectiveListed).toBe(7);
    expect(family.cushion).toBe(-3);
  });

  it("treats unsure inclusion as partial evidence", () => {
    const evidence = computeLoadEvidence(load({ partyIncluded: "unsure" }), {
      partySize: 2,
      now: NOW,
    });
    expect(evidence.effectiveListed).toBeNull();
    expect(evidence.cushion).toBeNull();
  });

  it("reads the same load differently for a solo traveller and a family of four", () => {
    const solo = loadPillar(load({ partyIncluded: "no" }), 1);
    const family = loadPillar(load({ partyIncluded: "no" }), 4);
    expect(solo.state).toBe("fair");
    expect(family.state).toBe("poor");
    expect(family.label).toBe("Oversubscribed");
  });

  it("scores a stronger load above a tighter one", () => {
    const base: Pillar[] = [
      { key: "operations", state: "good", label: "Normal", detail: "" },
      { key: "recovery", state: "good", label: "Good", detail: "" },
    ];
    const strong = scoreFromPillars([
      loadPillar(load({ openSeats: 18, standbys: 3, partyIncluded: "yes" }), 1),
      ...base,
    ]);
    const tight = scoreFromPillars([
      loadPillar(load({ openSeats: 2, standbys: 3, partyIncluded: "yes" }), 1),
      ...base,
    ]);
    expect(strong).toBeGreaterThan(tight);
    expect(judgeWithLoad([...base, loadPillar(load({ openSeats: 18, standbys: 3 }), 1)])).toBe(
      "favorable",
    );
  });
});
