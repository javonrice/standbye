/**
 * PlanStrategy contract — one Strategy = one unique ordered airport path.
 */
import { describe, expect, it } from "bun:test";

import type { GatewayOption, OptionSegment, StandbyOption } from "@/lib/aircue/standby";
import {
  airportPathFromOptionLike,
  attachOptionsToStrategies,
  buildStoredStrategies,
  buildStrategyCatalog,
  connectionPathFromLegs,
  connectionSeedsFromGatewayBuilds,
  optionRefsFromRankedOptions,
  strategyIdFromPath,
} from "@/lib/aircue/plan-strategy";

const seg = (origin: string, dest: string, label: string): OptionSegment => ({
  carrier: "UA",
  flightNumber: label.replace("UA", ""),
  flightLabel: label,
  origin,
  dest,
  depLocal: "8:00 AM",
  arrLocal: "10:00 AM",
  schedDepUtc: "2026-08-31T13:00:00Z",
  schedArrUtc: "2026-08-31T15:00:00Z",
  access: "home",
});

const gateway = (hub: string): GatewayOption => ({
  hub,
  city: hub,
  state: "fair",
  label: "Possible",
  summary: `${hub} works`,
  inboundShots: [],
  onwardDepartures: [],
  onwardCount: 2,
  recoveryState: "fair",
  recoveryLabel: "Good",
  caveat: null,
  addedMinutes: null,
});

const mockOption = (
  id: string,
  rank: number,
  origin: string,
  dest: string,
  label: string,
  optionKey: string,
): StandbyOption => ({
  id,
  planId: "plan-1",
  rank,
  kind: "nonstop",
  origin,
  dest,
  judgment: "mixed",
  confidence: "medium",
  headline: "",
  carrier: "UA",
  flightNumber: null,
  flightLabel: label,
  optionKey,
  depLocal: "8:00 AM",
  arrLocal: "10:00 AM",
  schedDepUtc: null,
  schedArrUtc: null,
  segments: [seg(origin, dest, label)],
  pillars: [],
  reasons: [],
  evidence: {
    availability: { checked: false, tested: [], largestShowing: null, checkedAt: null },
    conditions: null,
    history: null,
    holiday: null,
    recovery: { state: "fair", label: "Fair", summary: "", hoursRemaining: 0, laterNonstops: [], alternates: [] },
  },
  load: null,
  refreshedAt: new Date().toISOString(),
});

describe("strategy identity", () => {
  it("derives id from ordered airport path", () => {
    expect(strategyIdFromPath(["IAH", "OKC", "ORD"])).toBe("IAH>OKC>ORD");
    expect(strategyIdFromPath(["ord", "cvg"])).toBe("ORD>CVG");
  });

  it("groups same-route flights into one path", () => {
    const paths = ["UA2032", "UA3634", "UA1732", "UA730"].map((label) =>
      airportPathFromOptionLike({
        kind: "nonstop",
        origin: "ORD",
        dest: "CVG",
        segments: [seg("ORD", "CVG", label)],
      }),
    );
    const ids = new Set(paths.map(strategyIdFromPath));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe("ORD>CVG");
  });
});

describe("buildStoredStrategies", () => {
  it("merges four ORD→CVG flights into one Strategy with optionCount via attach", () => {
    const optionRefs = optionRefsFromRankedOptions([
      { rank: 1, optionKey: "a", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA2032")] },
      { rank: 2, optionKey: "b", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA3634")] },
      { rank: 3, optionKey: "c", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA1732")] },
      { rank: 4, optionKey: "d", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA730")] },
    ]);
    const stored = buildStoredStrategies({ optionRefs, connectionSeeds: [] });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.path).toEqual(["ORD", "CVG"]);

    const options = optionRefs.map((ref, i) =>
      mockOption(`opt-${i}`, ref.rank, "ORD", "CVG", `UA${2032 + i}`, ref.optionKey),
    );

    const attached = attachOptionsToStrategies(stored, options);
    expect(attached[0]!.optionCount).toBe(4);
    expect(attached[0]!.bestRank).toBe(1);
    expect(attached[0]!.bestOptionId).toBe("opt-0");
  });

  it("direct + non-hub connection yields two strategies", () => {
    const stored = buildStoredStrategies({
      optionRefs: optionRefsFromRankedOptions([
        { rank: 1, optionKey: "ns", kind: "nonstop", origin: "IAH", dest: "ORD", segments: [seg("IAH", "ORD", "UA100")] },
      ]),
      connectionSeeds: [
        {
          path: ["IAH", "OKC", "ORD"],
          gateway: gateway("OKC"),
          discoveryOrder: 0,
        },
      ],
    });
    expect(stored.map((s) => s.id).sort()).toEqual(["IAH>OKC>ORD", "IAH>ORD"]);
  });

  it("multiple connection stations yield distinct strategies", () => {
    const hubs = ["OKC", "STL", "AUS", "DEN"];
    const stored = buildStoredStrategies({
      optionRefs: [],
      connectionSeeds: hubs.map((hub, i) => ({
        path: connectionPathFromLegs({ firstOrigin: "IAH", via: hub, finalDest: "ORD" }),
        gateway: gateway(hub),
        discoveryOrder: i,
      })),
    });
    expect(stored).toHaveLength(4);
    expect(stored.map((s) => s.id).sort()).toEqual([
      "IAH>AUS>ORD",
      "IAH>DEN>ORD",
      "IAH>OKC>ORD",
      "IAH>STL>ORD",
    ]);
  });

  it("groups multiple flight combinations on the same connection path", () => {
    const path = ["IAH", "OKC", "ORD"];
    const stored = buildStoredStrategies({
      optionRefs: optionRefsFromRankedOptions([
        {
          rank: 2,
          optionKey: "c1",
          kind: "connection",
          origin: "IAH",
          dest: "ORD",
          segments: [seg("IAH", "OKC", "UA1"), seg("OKC", "ORD", "UA2")],
        },
        {
          rank: 5,
          optionKey: "c2",
          kind: "connection",
          origin: "IAH",
          dest: "ORD",
          segments: [seg("IAH", "OKC", "UA3"), seg("OKC", "ORD", "UA4")],
        },
      ]),
      connectionSeeds: [{ path, gateway: gateway("OKC"), discoveryOrder: 0 }],
    });
    expect(stored.filter((s) => s.id === "IAH>OKC>ORD")).toHaveLength(1);
  });

  it("preserves unscored connection strategies from gateway discovery", () => {
    const stored = buildStoredStrategies({
      optionRefs: optionRefsFromRankedOptions([
        { rank: 1, optionKey: "d", kind: "nonstop", origin: "IAH", dest: "ORD", segments: [seg("IAH", "ORD", "UA1")] },
      ]),
      connectionSeeds: [
        { path: ["IAH", "STL", "ORD"], gateway: gateway("STL"), discoveryOrder: 1 },
      ],
    });
    const stl = stored.find((s) => s.id === "IAH>STL>ORD");
    expect(stl).toBeDefined();
    const attached = attachOptionsToStrategies(stored, []);
    const stlAttached = attached.find((s) => s.id === "IAH>STL>ORD");
    expect(stlAttached?.bestOptionId).toBeNull();
    expect(stlAttached?.optionCount).toBe(0);
    expect(stlAttached?.gateway?.hub).toBe("STL");
  });

  it("uses lowest rank for bestRank on the same strategy", () => {
    const stored = buildStoredStrategies({
      optionRefs: optionRefsFromRankedOptions([
        { rank: 4, optionKey: "a", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA1")] },
        { rank: 1, optionKey: "b", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA2")] },
        { rank: 3, optionKey: "c", kind: "nonstop", origin: "ORD", dest: "CVG", segments: [seg("ORD", "CVG", "UA3")] },
      ]),
      connectionSeeds: [],
    });
    const attached = attachOptionsToStrategies(
      stored,
      [
        mockOption("a", 4, "ORD", "CVG", "UA1", "a"),
        mockOption("b", 1, "ORD", "CVG", "UA2", "b"),
        mockOption("c", 3, "ORD", "CVG", "UA3", "c"),
      ],
    );
    expect(attached[0]!.bestRank).toBe(1);
    expect(attached[0]!.bestOptionId).toBe("b");
  });

  it("is deterministic when option refs are reordered", () => {
    const refs = optionRefsFromRankedOptions([
      { rank: 2, optionKey: "b", kind: "nonstop", origin: "IAH", dest: "ORD", segments: [seg("IAH", "ORD", "UA2")] },
      { rank: 1, optionKey: "a", kind: "nonstop", origin: "IAH", dest: "ORD", segments: [seg("IAH", "ORD", "UA1")] },
    ]);
    const shuffled = [...refs].reverse();
    const a = buildStoredStrategies({ optionRefs: refs, connectionSeeds: [] });
    const b = buildStoredStrategies({ optionRefs: shuffled, connectionSeeds: [] });
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a[0]!.path).toEqual(["IAH", "ORD"]);
  });
});

describe("multi-origin connection paths", () => {
  it("uses the inbound leg origin in the strategy path", () => {
    const seeds = connectionSeedsFromGatewayBuilds(
      [
        {
          hub: "DEN",
          best: { first: { origin: "HOU" }, second: { dest: "ORD" } },
        },
      ],
      [gateway("DEN")],
    );
    expect(seeds[0]!.path).toEqual(["HOU", "DEN", "ORD"]);
  });
});

describe("buildStrategyCatalog", () => {
  it("combines ranked options and gateway builds", () => {
    const strategies = buildStrategyCatalog({
      rankedOptions: [
        { rank: 1, optionKey: "d", kind: "nonstop", origin: "IAH", dest: "ORD", segments: [seg("IAH", "ORD", "UA1")] },
      ],
      gatewayBuilds: [
        { hub: "OKC", best: { first: { origin: "IAH" }, second: { dest: "ORD" } } },
        { hub: "DEN", best: { first: { origin: "HOU" }, second: { dest: "ORD" } } },
      ],
      gateways: [gateway("OKC"), gateway("DEN")],
    });
    expect(strategies.map((s) => s.id).sort()).toEqual(["HOU>DEN>ORD", "IAH>OKC>ORD", "IAH>ORD"]);
  });
});
