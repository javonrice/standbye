/**
 * Shared connection viability policy tests.
 */
import { describe, expect, it } from "bun:test";

import {
  THIN_NETWORK_THRESHOLD,
  evaluateConnectionViability,
  detourCeilingForNetwork,
  caveatFromDetourRatio,
} from "@/lib/aircue/connection-viability.server";

describe("evaluateConnectionViability", () => {
  it("rejects extreme detour on broad network (IAH→ORD→OKC ~4.09)", () => {
    const result = evaluateConnectionViability({
      origin: "IAH",
      via: "ORD",
      destination: "OKC",
      mode: "normal",
      networkBreadth: THIN_NETWORK_THRESHOLD,
      detourRatio: 4.09,
    });
    expect(result.eligible).toBe(false);
  });

  it("allows thin-network backtrack (OKC→IAH→ORD ~1.91)", () => {
    const result = evaluateConnectionViability({
      origin: "OKC",
      via: "IAH",
      destination: "ORD",
      mode: "normal",
      networkBreadth: 2,
      detourRatio: 1.91,
    });
    expect(result.eligible).toBe(true);
    expect(result.detourCeiling).toBe(2.0);
    expect(result.caveat).toBe("strong_backtrack");
  });

  it("uses 1.45 ceiling on broad network", () => {
    expect(
      evaluateConnectionViability({
        origin: "IAH",
        via: "DEN",
        destination: "ORD",
        mode: "normal",
        networkBreadth: THIN_NETWORK_THRESHOLD,
        detourRatio: 1.4,
      }).eligible,
    ).toBe(true);

    expect(
      evaluateConnectionViability({
        origin: "IAH",
        via: "DEN",
        destination: "ORD",
        mode: "normal",
        networkBreadth: THIN_NETWORK_THRESHOLD,
        detourRatio: 1.5,
      }).eligible,
    ).toBe(false);
  });

  it("expert mode skips detour veto", () => {
    expect(
      evaluateConnectionViability({
        origin: "IAH",
        via: "ORD",
        destination: "OKC",
        mode: "expert",
        networkBreadth: 10,
        detourRatio: 4.09,
      }).eligible,
    ).toBe(true);
  });

  it("computes networkBreadth before detour — thin threshold is fixed", () => {
    expect(detourCeilingForNetwork({ mode: "normal", networkBreadth: 4 })).toBe(2.0);
    expect(detourCeilingForNetwork({ mode: "normal", networkBreadth: 5 })).toBe(1.45);
  });

  it("marks backtracking caveat at 1.22 on broad network", () => {
    expect(caveatFromDetourRatio(1.25, THIN_NETWORK_THRESHOLD)).toBe("backtracking");
    expect(caveatFromDetourRatio(1.25, 2)).toBe("strong_backtrack");
  });
});
