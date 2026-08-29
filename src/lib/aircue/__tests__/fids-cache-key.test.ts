import { describe, expect, it } from "bun:test";

import { extractWindowClock, fidsCacheKey, preferredBoardWindow, cancelLookbackWindow } from "@/lib/aircue/fids-cache-key";

describe("fidsCacheKey", () => {
  it("builds canonical v2 keys with exact window clocks", () => {
    expect(fidsCacheKey("ord", "2026-08-29", "2026-08-29T00:00", "2026-08-29T11:59")).toBe(
      "adb:fids:v2:ORD:2026-08-29:00:00-11:59",
    );
    expect(fidsCacheKey("ORD", "2026-08-29", "12:00", "23:59")).toBe(
      "adb:fids:v2:ORD:2026-08-29:12:00-23:59",
    );
  });

  it("extracts clocks from ISO and bare HH:MM", () => {
    expect(extractWindowClock("2026-08-29T03:55")).toBe("03:55");
    expect(extractWindowClock("03:55")).toBe("03:55");
  });

  it("schedule and cancel helpers agree on fixed halves when lookback fits", () => {
    const morning = preferredBoardWindow("2026-08-29", "10:00");
    expect(fidsCacheKey("ORD", "2026-08-29", morning.start, morning.end)).toBe(
      "adb:fids:v2:ORD:2026-08-29:00:00-11:59",
    );
    // Lookback must start at/after noon to fit the afternoon half (11h window).
    const afternoon = preferredBoardWindow("2026-08-29", "23:00");
    expect(fidsCacheKey("ORD", "2026-08-29", afternoon.start, afternoon.end)).toBe(
      "adb:fids:v2:ORD:2026-08-29:12:00-23:59",
    );
  });

  it("custom cancel lookback is keyed by exact window", () => {
    const w = cancelLookbackWindow("2026-08-29", "14:55");
    expect(fidsCacheKey("ORD", "2026-08-29", w.start, w.end)).toBe(
      "adb:fids:v2:ORD:2026-08-29:03:55-14:55",
    );
  });
});
