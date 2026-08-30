import { describe, expect, it } from "bun:test";

import { canContributeSharedSnapshot, normalizeAirlineCode } from "@/lib/aircue/load-screenshot/contribute-auth";
import {
  evaluateLoadFreshness,
  freshnessLabel,
  shouldPromptLoadRefresh,
} from "@/lib/aircue/load-screenshot/freshness";
import { interpretUnitedFlight } from "@/lib/aircue/load-screenshot/interpret/united";
import { matchExtractedToSegments, candidatesFromSegments } from "@/lib/aircue/load-screenshot/match";
import { resolveObservedAt } from "@/lib/aircue/load-screenshot/observed-at";
import { mergePersonalAndNetworkLoads } from "@/lib/aircue/load-screenshot/snapshots.server";
import { MockLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/mock";
import { resolveLoadScreenshotProviderId } from "@/lib/aircue/load-screenshot/index";
import type { OptionKeySegment } from "@/lib/aircue/option-key";
import type { ReportedLoad } from "@/lib/aircue/standby";

describe("contribute-auth", () => {
  it("allows shared write only when home matches extracted airline", () => {
    expect(
      canContributeSharedSnapshot({ contributorHomeAirline: "UA", extractedAirline: "UA" }),
    ).toBe(true);
    expect(
      canContributeSharedSnapshot({ contributorHomeAirline: "UA", extractedAirline: "AA" }),
    ).toBe(false);
    expect(
      canContributeSharedSnapshot({ contributorHomeAirline: "", extractedAirline: "UA" }),
    ).toBe(false);
  });

  it("normalizes airline codes", () => {
    expect(normalizeAirlineCode(" ua ")).toBe("UA");
    expect(normalizeAirlineCode("ANY")).toBeNull();
  });
});

describe("united interpreter", () => {
  it("normalizes UA flight tokens and cabin", () => {
    const row = interpretUnitedFlight({
      airline: "UAL",
      flightNumber: "UA0123",
      origin: "ord",
      dest: "lax",
      cabin: "First",
      openSeats: 4,
      standbys: 2,
    });
    expect(row.airline).toBe("UA");
    expect(row.flightNumber).toBe("123");
    expect(row.origin).toBe("ORD");
    expect(row.dest).toBe("LAX");
    expect(row.cabin).toBe("business");
  });
});

describe("matchExtractedToSegments", () => {
  const segments: OptionKeySegment[] = [
    {
      carrier: "UA",
      flightNumber: "123",
      origin: "ORD",
      dest: "LAX",
      depLocal: "10:20 AM",
      schedDepUtc: "2026-09-01T15:20:00Z",
    },
    {
      carrier: "UA",
      flightNumber: "456",
      origin: "ORD",
      dest: "DEN",
      depLocal: "12:00 PM",
      schedDepUtc: "2026-09-01T17:00:00Z",
    },
  ];

  it("matches carrier+number+route", () => {
    const result = matchExtractedToSegments(
      { airline: "UA", flightNumber: "123", origin: "ORD", dest: "LAX" },
      candidatesFromSegments(segments),
    );
    expect(result.status).toBe("matched");
    expect(result.segmentKey).toContain("UA123");
    expect(result.matchConfidence).toBeGreaterThanOrEqual(0.7);
  });

  it("returns unmatched when flight is not on the plan", () => {
    const result = matchExtractedToSegments(
      { airline: "UA", flightNumber: "999", origin: "ORD", dest: "LAX" },
      candidatesFromSegments(segments),
    );
    expect(result.status).toBe("unmatched");
  });
});

describe("observed-at", () => {
  it("prefers screenshot timestamp over metadata", () => {
    const r = resolveObservedAt({
      parse: {
        observedAtGuess: {
          at: "2026-09-01T12:00:00.000Z",
          source: "screenshot",
          confidence: 0.8,
        },
      },
      fileLastModifiedMs: Date.parse("2026-08-01T00:00:00.000Z"),
      nowMs: Date.parse("2026-09-01T13:00:00.000Z"),
    });
    expect(r.timestampSource).toBe("screenshot");
    expect(r.observedAt).toBe("2026-09-01T12:00:00.000Z");
  });

  it("asks confirm when metadata looks old near departure", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    const r = resolveObservedAt({
      fileLastModifiedMs: now - 8 * 3_600_000,
      nowMs: now,
      hoursToDeparture: 4,
    });
    expect(r.timestampSource).toBe("metadata");
    expect(r.askRecentConfirm).toBe(true);
  });
});

describe("freshness", () => {
  it("marks near-dep aging loads stale", () => {
    const now = Date.parse("2026-09-01T12:00:00.000Z");
    const { band } = evaluateLoadFreshness({
      observedAtIso: new Date(now - 2 * 3_600_000).toISOString(),
      schedDepUtc: new Date(now + 2 * 3_600_000).toISOString(),
      nowMs: now,
    });
    expect(band).toBe("stale");
    expect(freshnessLabel(band, 2).toLowerCase()).toContain("refresh");
  });

  it("prompts refresh only when home airline can contribute", () => {
    expect(
      shouldPromptLoadRefresh({
        watchingOrPlanDetail: true,
        usedLoadSnapshot: true,
        freshness: "stale",
        hoursToDep: 2,
        ageHours: 3,
        userHomeAirline: "UA",
        snapshotAirline: "UA",
      }),
    ).toBe(true);
    expect(
      shouldPromptLoadRefresh({
        watchingOrPlanDetail: true,
        usedLoadSnapshot: true,
        freshness: "stale",
        hoursToDep: 2,
        ageHours: 3,
        userHomeAirline: "AA",
        snapshotAirline: "UA",
      }),
    ).toBe(false);
  });
});

describe("mergePersonalAndNetworkLoads", () => {
  it("prefers personal over network for the same segment", () => {
    const personal = new Map<string, ReportedLoad>([
      [
        "UA123:ORD-LAX:2026-09-01T10:00",
        {
          id: "p1",
          segmentKey: "UA123:ORD-LAX:2026-09-01T10:00",
          flightLabel: "UA123",
          openSeats: 5,
          standbys: 1,
          cabin: "economy",
          source: "employee_system",
          partyIncluded: "yes",
          checkedAt: "2026-09-01T11:00:00Z",
        },
      ],
    ]);
    const network = new Map<string, ReportedLoad>([
      [
        "UA123:ORD-LAX:2026-09-01T10:00",
        {
          id: "n1",
          segmentKey: "UA123:ORD-LAX:2026-09-01T10:00",
          flightLabel: "UA123",
          openSeats: 20,
          standbys: 0,
          cabin: "economy",
          source: "network_snapshot",
          partyIncluded: "no",
          checkedAt: "2026-09-01T10:00:00Z",
        },
      ],
      [
        "UA456:ORD-DEN:2026-09-01T12:00",
        {
          id: "n2",
          segmentKey: "UA456:ORD-DEN:2026-09-01T12:00",
          flightLabel: "UA456",
          openSeats: 8,
          standbys: 2,
          cabin: "economy",
          source: "network_snapshot",
          partyIncluded: "no",
          checkedAt: "2026-09-01T10:30:00Z",
        },
      ],
    ]);
    const merged = mergePersonalAndNetworkLoads(personal, network);
    expect(merged.get("UA123:ORD-LAX:2026-09-01T10:00")?.source).toBe("employee_system");
    expect(merged.get("UA123:ORD-LAX:2026-09-01T10:00")?.openSeats).toBe(5);
    expect(merged.get("UA456:ORD-DEN:2026-09-01T12:00")?.source).toBe("network_snapshot");
    expect(merged.get("UA456:ORD-DEN:2026-09-01T12:00")?.partyIncluded).toBe("no");
  });
});

describe("LoadScreenshotParser factory / mock", () => {
  it("defaults provider id to gateway", () => {
    const prev = process.env["LOAD_SCREENSHOT_PROVIDER"];
    delete process.env["LOAD_SCREENSHOT_PROVIDER"];
    expect(resolveLoadScreenshotProviderId()).toBe("gateway");
    process.env["LOAD_SCREENSHOT_PROVIDER"] = "lovable";
    expect(resolveLoadScreenshotProviderId()).toBe("lovable");
    process.env["LOAD_SCREENSHOT_PROVIDER"] = "mock";
    expect(resolveLoadScreenshotProviderId()).toBe("mock");
    if (prev === undefined) delete process.env["LOAD_SCREENSHOT_PROVIDER"];
    else process.env["LOAD_SCREENSHOT_PROVIDER"] = prev;
  });

  it("mock parser returns structured flights without network", async () => {
    const parser = new MockLoadScreenshotParser();
    const result = await parser.parseScreenshot({
      imageBytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      airlineHint: "UA",
    });
    expect(result.provider).toBe("mock");
    expect(result.flights.length).toBeGreaterThan(0);
    expect(result.flights[0]?.airline).toBe("UA");
  });
});
