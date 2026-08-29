/**
 * Distinct option_key survival + visual disambiguation.
 */
import { describe, expect, it } from "bun:test";

import { buildOptionKey } from "@/lib/aircue/option-key";
import { formatOptionTimingRange, optionDisambiguationNote } from "@/lib/aircue/option-display";
import { matchExistingOptionRow } from "@/lib/aircue/sync-option-match";
import { schedInstantForKey } from "@/lib/aircue/gf8-itineraries.server";
import type { StandbyOption } from "@/lib/aircue/standby";

function baseOption(overrides: Partial<StandbyOption> & Pick<StandbyOption, "id" | "optionKey">): StandbyOption {
  return {
    planId: "plan-1",
    rank: 1,
    kind: "nonstop",
    judgment: "mixed",
    confidence: "medium",
    headline: "",
    flightLabel: "UA881",
    carrier: "UA",
    flightNumber: "881",
    origin: "ORD",
    dest: "HND",
    depLocal: "12:00 PM",
    arrLocal: "3:00 PM",
    schedDepUtc: "2026-10-15T17:00:00.000Z",
    schedArrUtc: "2026-10-16T06:00:00.000Z",
    segments: [
      {
        carrier: "UA",
        flightNumber: "881",
        flightLabel: "UA881",
        origin: "ORD",
        dest: "HND",
        depLocal: "12:00 PM",
        arrLocal: "3:00 PM",
        schedDepUtc: "2026-10-15T17:00:00.000Z",
        schedArrUtc: "2026-10-16T06:00:00.000Z",
        arrivalDayOffset: 1,
      },
    ],
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
      arrivalDayOffset: 1,
    },
    load: null,
    refreshedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("distinct options with identical flight labels", () => {
  it("keeps distinct option_keys for same flight number with distinct canonical timestamps", () => {
    const early = buildOptionKey([
      {
        carrier: "UA",
        flightNumber: "1448",
        origin: "ORD",
        dest: "CMH",
        schedDepUtc: "2026-09-01T14:00:00.000Z",
      },
    ]);
    const late = buildOptionKey([
      {
        carrier: "UA",
        flightNumber: "1448",
        origin: "ORD",
        dest: "CMH",
        schedDepUtc: "2026-09-01T22:00:00.000Z",
      },
    ]);
    expect(early).not.toBe(late);
    expect(early).toContain("UA1448:ORD-CMH:2026-09-01T14:00");
    expect(late).toContain("UA1448:ORD-CMH:2026-09-01T22:00");
  });

  it("sync match never collapses two keyed options that share a flight_label", () => {
    const existing = [
      { id: "row-a", option_key: "UA1448:ORD-CMH:2026-09-01T14:00", flight_label: "UA1448" },
      { id: "row-b", option_key: "UA1448:ORD-CMH:2026-09-01T22:00", flight_label: "UA1448" },
    ];
    const first = matchExistingOptionRow(existing, {
      optionKey: "UA1448:ORD-CMH:2026-09-01T14:00",
      flightLabel: "UA1448",
    });
    const claimed = new Set([first!.id]);
    const remaining = existing.filter((r) => !claimed.has(r.id));
    const second = matchExistingOptionRow(remaining, {
      optionKey: "UA1448:ORD-CMH:2026-09-01T22:00",
      flightLabel: "UA1448",
    });
    expect(first?.id).toBe("row-a");
    expect(second?.id).toBe("row-b");
    // Primary row identity is unchanged when the matching key is replayed.
    const again = matchExistingOptionRow(existing, {
      optionKey: "UA1448:ORD-CMH:2026-09-01T14:00",
      flightLabel: "UA1448",
    });
    expect(again?.id).toBe("row-a");
  });

  it("GF8 local-naive converts to UTC so schedule keys can merge", () => {
    // ORD 5:45 PM CDT = 22:45Z
    const gf8 = schedInstantForKey("2026-09-01T17:45:00", "America/Chicago");
    const schedule = "2026-09-01T22:45:00.000Z".slice(0, 16);
    expect(gf8).toBe(schedule);
    expect(
      buildOptionKey([
        { carrier: "UA", flightNumber: "500", origin: "ORD", dest: "CMH", schedDepUtc: gf8 },
      ]),
    ).toBe(
      buildOptionKey([
        {
          carrier: "UA",
          flightNumber: "500",
          origin: "ORD",
          dest: "CMH",
          schedDepUtc: "2026-09-01T22:45:00.000Z",
        },
      ]),
    );
  });

  it("day offset distinguishes overnight twins that share a flight label", () => {
    const a = baseOption({
      id: "a",
      optionKey: "UA881:ORD-HND:2026-10-15T17:00",
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
        arrivalDayOffset: 1,
      },
    });
    const b = baseOption({
      id: "b",
      optionKey: "UA881:ORD-HND:2026-10-15T18:00",
      schedDepUtc: "2026-10-15T18:00:00.000Z",
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
        arrivalDayOffset: 2,
      },
    });
    expect(formatOptionTimingRange(a)).toBe("12:00 PM → 3:00 PM+1");
    expect(formatOptionTimingRange(b)).toBe("12:00 PM → 3:00 PM+2");
    expect(optionDisambiguationNote(a, [a, b])).toBeNull();
  });

  it("connection via note when labels and clocks collide", () => {
    const viaOrd = baseOption({
      id: "c1",
      optionKey: "k1",
      flightLabel: "UA 100 → UA 200",
      kind: "connection",
      depLocal: "8:00 AM",
      arrLocal: "6:00 PM",
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
        arrivalDayOffset: 0,
      },
      segments: [
        {
          carrier: "UA",
          flightNumber: "100",
          flightLabel: "UA100",
          origin: "BOS",
          dest: "ORD",
          depLocal: "8:00 AM",
          arrLocal: "10:00 AM",
          schedDepUtc: "2026-09-01T12:00:00.000Z",
        },
        {
          carrier: "UA",
          flightNumber: "200",
          flightLabel: "UA200",
          origin: "ORD",
          dest: "LAX",
          depLocal: "12:00 PM",
          arrLocal: "6:00 PM",
          schedDepUtc: "2026-09-01T17:00:00.000Z",
        },
      ],
    });
    const viaDen = {
      ...viaOrd,
      id: "c2",
      optionKey: "k2",
      segments: [
        {
          ...viaOrd.segments[0]!,
          dest: "DEN",
          schedDepUtc: "2026-09-01T12:30:00.000Z",
        },
        {
          ...viaOrd.segments[1]!,
          origin: "DEN",
          schedDepUtc: "2026-09-01T17:30:00.000Z",
        },
      ],
    };
    expect(optionDisambiguationNote(viaOrd, [viaOrd, viaDen])).toBe("via ORD");
    expect(optionDisambiguationNote(viaDen, [viaOrd, viaDen])).toBe("via DEN");
  });
});
