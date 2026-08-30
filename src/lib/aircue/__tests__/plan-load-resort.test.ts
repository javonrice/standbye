import { describe, expect, it } from "bun:test";

import { computeLoadEvidence, loadPillarFromEvidence } from "@/lib/aircue/load-evidence";
import { buildSegmentKey } from "@/lib/aircue/option-key";
import { rescoreStoredOption, resortScoredOptions } from "@/lib/aircue/plan-load-resort";
import type { ReportedLoad } from "@/lib/aircue/standby";

function load(overrides: Partial<ReportedLoad>): ReportedLoad {
  return {
    id: "load-1",
    segmentKey: "UA123:ORD-DEN:2026-09-01T10:00",
    flightLabel: "UA123",
    openSeats: 2,
    standbys: 15,
    alreadyListed: false,
    cabin: "economy",
    source: "employee_system",
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

function optionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "opt-a",
    pillars: [
      { key: "availability", state: "good", label: "Strong", detail: "Public" },
      { key: "operations", state: "good", label: "Normal", detail: "Normal" },
      { key: "history", state: "fair", label: "Fuller", detail: "History" },
      { key: "recovery", state: "good", label: "Good", detail: "6 later" },
    ],
    evidence: { access: "home", staffEligibility: "eligible", standbyClears: 1 },
    segments: [
      {
        carrier: "UA",
        flightNumber: "123",
        flightLabel: "UA123",
        origin: "ORD",
        dest: "DEN",
        schedDepUtc: "2026-09-01T10:00:00Z",
        depLocal: "5:00 AM",
      },
    ],
    option_key: "UA123:ORD-DEN:2026-09-01T10:00",
    sched_dep_utc: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

describe("load evidence", () => {
  it("counts party size when not already listed", () => {
    const evidence = computeLoadEvidence(load({ openSeats: 10, standbys: 8, alreadyListed: false }), {
      partySize: 3,
    });
    expect(evidence.effectiveListed).toBe(11);
    expect(evidence.cushion).toBe(-1);
    expect(loadPillarFromEvidence(evidence).state).toBe("poor");
  });

  it("does not add party when already listed", () => {
    const evidence = computeLoadEvidence(load({ openSeats: 10, standbys: 8, alreadyListed: true }), {
      partySize: 3,
    });
    expect(evidence.effectiveListed).toBe(8);
    expect(evidence.cushion).toBe(2);
  });
});

describe("plan load resort", () => {
  it("drops an oversubscribed reported load from rank 1", () => {
    const key = buildSegmentKey({
      carrier: "UA",
      flightNumber: "123",
      origin: "ORD",
      dest: "DEN",
      schedDepUtc: "2026-09-01T10:00:00Z",
    });
    const loads = new Map([[key, load({ segmentKey: key })]]);

    const tight = rescoreStoredOption({
      row: optionRow({ id: "opt-a", rank: 1, score: 80 }),
      loadsBySegment: loads,
      partySize: 1,
    });
    const strong = rescoreStoredOption({
      row: optionRow({
        id: "opt-b",
        rank: 2,
        score: 70,
        segments: [
          {
            carrier: "UA",
            flightNumber: "456",
            flightLabel: "UA456",
            origin: "ORD",
            dest: "DEN",
            schedDepUtc: "2026-09-01T12:00:00Z",
            depLocal: "7:00 AM",
          },
        ],
        option_key: "UA456:ORD-DEN:2026-09-01T12:00",
        sched_dep_utc: "2026-09-01T12:00:00Z",
      }),
      loadsBySegment: new Map(),
      partySize: 1,
    });

    expect(tight.judgment).toBe("riskier");

    const resort = resortScoredOptions(
      [
        {
          id: "opt-a",
          score: tight.score,
          schedDepUtc: "2026-09-01T10:00:00Z",
          judgment: tight.judgment,
          confidence: tight.confidence,
          pillars: tight.pillars,
          primaryLoad: load({ segmentKey: key }),
        },
        {
          id: "opt-b",
          score: strong.score,
          schedDepUtc: "2026-09-01T12:00:00Z",
          judgment: strong.judgment,
          confidence: strong.confidence,
          pillars: strong.pillars,
          primaryLoad: null,
        },
      ],
      "opt-a",
    );

    expect(resort.bestOptionChanged).toBe(true);
    expect(resort.newPreferredId).toBe("opt-b");
    expect(resort.options[0]?.id).toBe("opt-b");
  });

  it("keeps distinct segment keys separate for same flight number", () => {
    const earlyKey = "UA1448:ORD-CMH:2026-09-01T14:00";
    const lateKey = "UA1448:ORD-CMH:2026-09-01T22:00";
    const loads = new Map([
      [earlyKey, load({ segmentKey: earlyKey, openSeats: 2, standbys: 15 })],
    ]);

    const early = rescoreStoredOption({
      row: optionRow({
        option_key: earlyKey,
        id: "early",
        sched_dep_utc: "2026-09-01T14:00:00Z",
        segments: [
          {
            carrier: "UA",
            flightNumber: "1448",
            flightLabel: "UA1448",
            origin: "ORD",
            dest: "CMH",
            schedDepUtc: "2026-09-01T14:00:00Z",
            depLocal: "9:00 AM",
          },
        ],
      }),
      loadsBySegment: loads,
      partySize: 1,
    });
    const late = rescoreStoredOption({
      row: optionRow({
        id: "late",
        option_key: lateKey,
        sched_dep_utc: "2026-09-01T22:00:00Z",
        segments: [
          {
            carrier: "UA",
            flightNumber: "1448",
            flightLabel: "UA1448",
            origin: "ORD",
            dest: "CMH",
            schedDepUtc: "2026-09-01T22:00:00Z",
            depLocal: "5:00 PM",
          },
        ],
      }),
      loadsBySegment: loads,
      partySize: 1,
    });

    expect(early.judgment).toBe("riskier");
    expect(late.judgment).not.toBe("riskier");
  });
});
