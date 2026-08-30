import { describe, expect, it } from "bun:test";

import {
  computeLoadEvidence,
  cushionScoreAdjustment,
  loadPillarFromEvidence,
} from "@/lib/aircue/load-evidence";
import { rescoreOptionPillars } from "@/lib/aircue/option-scoring";
import { buildSegmentKey } from "@/lib/aircue/option-key";
import { rescoreStoredOption, resortScoredOptions } from "@/lib/aircue/plan-load-resort";
import type { Pillar, ReportedLoad } from "@/lib/aircue/standby";

function load(overrides: Partial<ReportedLoad>): ReportedLoad {
  return {
    id: "load-1",
    segmentKey: "UA123:ORD-DEN:2026-09-01T10:00",
    flightLabel: "UA123",
    openSeats: 2,
    standbys: 15,
    partyIncluded: "no",
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
    const evidence = computeLoadEvidence(load({ openSeats: 10, standbys: 8, partyIncluded: "no" }), {
      partySize: 3,
    });
    expect(evidence.effectiveListed).toBe(11);
    expect(evidence.cushion).toBe(-1);
    expect(loadPillarFromEvidence(evidence).state).toBe("poor");
  });

  it("does not add party when already listed", () => {
    const evidence = computeLoadEvidence(load({ openSeats: 10, standbys: 8, partyIncluded: "yes" }), {
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

  it("partial load is neutral: strong public availability stays Strong for ranking", () => {
    const key = "UA123:ORD-DEN:2026-09-01T10:00";
    const row = optionRow({ id: "opt-a" });
    const baseline = rescoreStoredOption({ row, loadsBySegment: new Map(), partySize: 1 });
    const withPartial = rescoreStoredOption({
      row,
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 8, standbys: null, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });

    expect(withPartial.score).toBe(baseline.score);
    expect(withPartial.pillars.find((p) => p.key === "availability")?.label).toBe("Partial");
    expect(withPartial.pillars.find((p) => p.key === "availability")?.state).toBe("unknown");
    expect(withPartial.confidence).toBe("medium");
  });

  it("partial load is neutral: poor public availability is not improved", () => {
    const key = "UA123:ORD-DEN:2026-09-01T10:00";
    const row = optionRow({
      id: "opt-a",
      pillars: [
        { key: "availability", state: "poor", label: "Oversubscribed", detail: "Public poor" },
        { key: "operations", state: "good", label: "Normal", detail: "Normal" },
        { key: "history", state: "fair", label: "Fuller", detail: "History" },
        { key: "recovery", state: "good", label: "Good", detail: "6 later" },
      ],
    });
    const baseline = rescoreStoredOption({ row, loadsBySegment: new Map(), partySize: 1 });
    const withPartial = rescoreStoredOption({
      row,
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 8, standbys: null, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });

    expect(withPartial.score).toBe(baseline.score);
    expect(withPartial.judgment).toBe(baseline.judgment);
    expect(withPartial.pillars.find((p) => p.key === "availability")?.label).toBe("Partial");
  });

  it("connection keeps public availability on a segment with partial load", () => {
    const leg1Key = "UA123:ORD-DEN:2026-09-01T10:00";
    const leg2Key = "UA456:DEN-LAX:2026-09-01T14:00";
    const row = optionRow({
      id: "connect",
      option_key: `${leg1Key}|${leg2Key}`,
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
        {
          carrier: "UA",
          flightNumber: "456",
          flightLabel: "UA456",
          origin: "DEN",
          dest: "LAX",
          schedDepUtc: "2026-09-01T14:00:00Z",
          depLocal: "7:00 AM",
        },
      ],
    });
    const baseline = rescoreStoredOption({ row, loadsBySegment: new Map(), partySize: 1 });
    const withPartial = rescoreStoredOption({
      row,
      loadsBySegment: new Map([
        [leg1Key, load({ segmentKey: leg1Key, openSeats: 8, standbys: null, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });

    expect(withPartial.score).toBe(baseline.score);
    expect(withPartial.pillars.find((p) => p.key === "availability")?.label).toBe("Partial");
  });

  it("complete 8 open / 0 listed still overrides public availability", () => {
    const key = "UA123:ORD-DEN:2026-09-01T10:00";
    const row = optionRow({
      id: "opt-a",
      pillars: [
        { key: "availability", state: "fair", label: "Tight", detail: "Public" },
        { key: "operations", state: "good", label: "Normal", detail: "Normal" },
        { key: "history", state: "fair", label: "Fuller", detail: "History" },
        { key: "recovery", state: "good", label: "Good", detail: "6 later" },
      ],
    });
    const baseline = rescoreStoredOption({ row, loadsBySegment: new Map(), partySize: 1 });
    const withComplete = rescoreStoredOption({
      row,
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 8, standbys: 0, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });

    expect(withComplete.score).toBeGreaterThan(baseline.score);
    expect(withComplete.pillars.find((p) => p.key === "availability")?.state).toBe("good");
    expect(withComplete.pillars.find((p) => p.key === "availability")?.label).toBe("Strong");
  });

  it("shared rescoreOptionPillars keeps public availability when load is partial", () => {
    const key = buildSegmentKey({
      carrier: "UA",
      flightNumber: "123",
      origin: "ORD",
      dest: "DEN",
      schedDepUtc: "2026-09-01T10:00:00Z",
    });
    const publicAvailability: Pillar = {
      key: "availability",
      state: "good",
      label: "Strong",
      detail: "Public",
    };
    const pillars: Pillar[] = [
      publicAvailability,
      { key: "operations", state: "good", label: "Normal", detail: "Normal" },
      { key: "history", state: "fair", label: "Fuller", detail: "History" },
      { key: "recovery", state: "good", label: "Good", detail: "6 later" },
    ];
    const segments = [
      {
        carrier: "UA",
        flightNumber: "123",
        origin: "ORD",
        dest: "DEN",
        schedDepUtc: "2026-09-01T10:00:00Z",
        depLocal: "5:00 AM",
      },
    ];
    const baseline = rescoreOptionPillars({
      pillars,
      segments,
      publicAvailability,
      loadsBySegment: new Map(),
      partySize: 1,
      access: "home",
      standbyClears: 1,
      staffEligibility: "eligible",
    });
    const withPartial = rescoreOptionPillars({
      pillars,
      segments,
      publicAvailability,
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 8, standbys: null, partyIncluded: "yes" })],
      ]),
      partySize: 1,
      access: "home",
      standbyClears: 1,
      staffEligibility: "eligible",
    });

    expect(withPartial.score).toBe(baseline.score);
    expect(withPartial.pillars.find((p) => p.key === "availability")?.label).toBe("Partial");
    expect(withPartial.confidence).toBe("medium");
  });

  it("partial load does not change score relative to public-only baseline", () => {
    const keyA = "UA123:ORD-DEN:2026-09-01T10:00";
    const keyB = "UA456:ORD-DEN:2026-09-01T12:00";
    const partial = rescoreStoredOption({
      row: optionRow({ id: "opt-a" }),
      loadsBySegment: new Map([
        [keyA, load({ segmentKey: keyA, openSeats: 8, standbys: null, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });
    const modest = rescoreStoredOption({
      row: optionRow({
        id: "opt-b",
        option_key: keyB,
        sched_dep_utc: "2026-09-01T12:00:00Z",
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
      }),
      loadsBySegment: new Map([
        [keyB, load({ segmentKey: keyB, openSeats: 6, standbys: 5, partyIncluded: "no" })],
      ]),
      partySize: 1,
    });

    expect(partial.pillars.find((p) => p.key === "availability")?.state).toBe("unknown");
    expect(partial.score).toBe(
      rescoreStoredOption({ row: optionRow({ id: "opt-a" }), loadsBySegment: new Map(), partySize: 1 }).score,
    );
    expect(modest.score).toBeLessThan(partial.score);
  });

  it("excellent load does not beat excellent recovery when cushion adjustment is capped", () => {
    const key = buildSegmentKey({
      carrier: "UA",
      flightNumber: "999",
      origin: "ORD",
      dest: "DEN",
      schedDepUtc: "2026-09-01T22:00:00Z",
    });
    const greatLoad = rescoreStoredOption({
      row: optionRow({
        id: "last-flight",
        pillars: [
          { key: "availability", state: "good", label: "Strong", detail: "Public" },
          { key: "operations", state: "good", label: "Normal", detail: "Normal" },
          { key: "history", state: "fair", label: "Fuller", detail: "History" },
          { key: "recovery", state: "poor", label: "Poor", detail: "Last flight" },
        ],
      }),
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 25, standbys: 2, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });
    const modestLoadStrongRecovery = rescoreStoredOption({
      row: optionRow({
        id: "earlier",
        pillars: [
          { key: "availability", state: "fair", label: "Tight", detail: "Public" },
          { key: "operations", state: "good", label: "Normal", detail: "Normal" },
          { key: "history", state: "fair", label: "Fuller", detail: "History" },
          { key: "recovery", state: "good", label: "Good", detail: "6 later" },
        ],
      }),
      loadsBySegment: new Map([
        [
          buildSegmentKey({
            carrier: "UA",
            flightNumber: "123",
            origin: "ORD",
            dest: "DEN",
            schedDepUtc: "2026-09-01T10:00:00Z",
          }),
          load({ openSeats: 6, standbys: 5, partyIncluded: "no" }),
        ],
      ]),
      partySize: 1,
    });

    expect(greatLoad.pillars.find((p) => p.key === "availability")?.state).toBe("good");
    expect(modestLoadStrongRecovery.score).toBeGreaterThan(greatLoad.score);
  });

  it("does not double-count cushion via pillar state and a second raw score pass", () => {
    const key = buildSegmentKey({
      carrier: "UA",
      flightNumber: "123",
      origin: "ORD",
      dest: "DEN",
      schedDepUtc: "2026-09-01T10:00:00Z",
    });
    const withExtremeLoad = rescoreStoredOption({
      row: optionRow({ id: "loaded" }),
      loadsBySegment: new Map([
        [key, load({ segmentKey: key, openSeats: 28, standbys: 0, partyIncluded: "yes" })],
      ]),
      partySize: 1,
    });
    const withoutLoad = rescoreStoredOption({
      row: optionRow({ id: "baseline" }),
      loadsBySegment: new Map(),
      partySize: 1,
    });
    const delta = withExtremeLoad.score - withoutLoad.score;
    expect(delta).toBeLessThan(Math.round(20 * 1.5));
    expect(cushionScoreAdjustment(20, 1)).toBe(12);
    expect(cushionScoreAdjustment(-15, 1)).toBe(-12);
  });
});
