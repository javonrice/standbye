/** Party-aware interpretation of an employee-reported load. */
import { describe, expect, it } from "bun:test";

import { loadPillar, readLoad, scoreWithLoad } from "@/lib/aircue/load-adjust";
import type { Pillar, ReportedLoad } from "@/lib/aircue/standby";

const NOW = "2026-08-30T18:00:00.000Z";

function load(overrides: Partial<ReportedLoad> = {}): ReportedLoad {
  return {
    id: "load-1",
    flightLabel: "UA222",
    travelDate: "2026-08-30",
    openSeats: 4,
    standbys: 3,
    cabin: "economy",
    source: "employee_system",
    checkedAt: "2026-08-30T17:45:00.000Z",
    partyIncluded: "yes",
    ...overrides,
  } as ReportedLoad;
}

describe("readLoad", () => {
  it("counts the traveller's party when they are not listed yet", () => {
    const solo = readLoad(load({ partyIncluded: "no" }), { partySize: 1, now: NOW });
    const family = readLoad(load({ partyIncluded: "no" }), { partySize: 4, now: NOW });
    expect(solo.effectiveDemand).toBe(4);
    expect(family.effectiveDemand).toBe(7);
    expect(family.cushion).toBe(-3);
  });

  it("flags unknown inclusion as uncertain without changing demand", () => {
    const reading = readLoad(load({ partyIncluded: "unsure" }), { partySize: 2, now: NOW });
    expect(reading.effectiveDemand).toBe(3);
    expect(reading.uncertain).toBe(true);
  });

  it("marks reports older than six hours as stale", () => {
    const reading = readLoad(load({ checkedAt: "2026-08-30T08:00:00.000Z" }), {
      partySize: 1,
      now: NOW,
    });
    expect(reading.stale).toBe(true);
  });
});

describe("loadPillar", () => {
  it("reads the same load differently for a solo traveller and a family of four", () => {
    const solo = loadPillar(load({ partyIncluded: "no" }), { partySize: 1, now: NOW });
    const family = loadPillar(load({ partyIncluded: "no" }), { partySize: 4, now: NOW });
    expect(solo.state).toBe("fair");
    expect(family.state).toBe("poor");
    expect(family.label).toBe("Oversubscribed");
  });

  it("scores a stronger load above a tighter one so ranking can move", () => {
    const base: Pillar[] = [
      { key: "operations", state: "good", label: "Normal", detail: "" },
      { key: "recovery", state: "good", label: "Good", detail: "" },
    ];
    const strong = scoreWithLoad([
      loadPillar(load({ openSeats: 18, standbys: 3 }), { partySize: 1, now: NOW }),
      ...base,
    ]);
    const tight = scoreWithLoad([
      loadPillar(load({ openSeats: 2, standbys: 3 }), { partySize: 1, now: NOW }),
      ...base,
    ]);
    expect(strong).toBeGreaterThan(tight);
  });
});
