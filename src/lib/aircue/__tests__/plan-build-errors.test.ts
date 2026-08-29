/**
 * Plan-build error copy — airport / provider / generic stay distinct.
 */
import { describe, expect, it } from "bun:test";

import { UnresolvedAirportError } from "@/lib/aircue/airports-canonical.server";
import {
  planBuildErrorMessage,
  unresolvedAirportUserMessage,
} from "@/lib/aircue/plan-build-errors";

describe("canonical airport failure copy", () => {
  it("one bad airport uses actionable copy", () => {
    const err = new UnresolvedAirportError(["ZZQ"]);
    expect(err.message).toBe(
      "We don't recognize ZZQ yet. Check the airport code and try again.",
    );
    expect(planBuildErrorMessage(err)).toBe(err.message);
  });

  it("two bad airports name both codes", () => {
    expect(unresolvedAirportUserMessage(["ZZQ", "QQZ"])).toBe(
      "We don't recognize ZZQ or QQZ yet. Check the airport codes and try again.",
    );
    const err = new UnresolvedAirportError(["zzq", "QQZ"]);
    expect(err.codes).toEqual(["ZZQ", "QQZ"]);
    expect(err.message).toContain("ZZQ");
    expect(err.message).toContain("QQZ");
  });

  it("does not treat empty provider results as invalid airports", () => {
    expect(planBuildErrorMessage(new Error("No flights found"))).toBe(
      "We could not build that plan. Try again in a moment.",
    );
    expect(planBuildErrorMessage(new Error("provider temporarily unavailable"))).toBe(
      "Flight data is temporarily unavailable. Try again in a moment.",
    );
    expect(planBuildErrorMessage(new Error("DATA_UNAVAILABLE"))).toBe(
      "Flight data is temporarily unavailable. Try again in a moment.",
    );
  });

  it("generic unexpected failures stay generic", () => {
    expect(planBuildErrorMessage(new Error("boom"))).toBe(
      "We could not build that plan. Try again in a moment.",
    );
    expect(planBuildErrorMessage({})).toBe(
      "We could not build that plan. Try again in a moment.",
    );
  });
});
