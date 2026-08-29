import { describe, expect, it } from "bun:test";

import { buildOptionKey } from "@/lib/aircue/option-key";
import {
  buildAccessMetaFromDraft,
  effectiveStaffTravelCarriers,
  resolveTravelAccess,
} from "@/lib/aircue/travel-access";
import { isFaaCoverageCountry } from "@/lib/aircue/coverage";

describe("buildOptionKey itinerary identity", () => {
  it("keeps same-hub different carriers as distinct keys", () => {
    const uaNh = buildOptionKey([
      {
        carrier: "UA",
        flightNumber: "881",
        origin: "ORD",
        dest: "HND",
        schedDepUtc: "2026-10-15T17:00:00Z",
      },
      {
        carrier: "NH",
        flightNumber: "891",
        origin: "HND",
        dest: "SGN",
        schedDepUtc: "2026-10-16T09:00:00Z",
      },
    ]);
    const uaJl = buildOptionKey([
      {
        carrier: "UA",
        flightNumber: "881",
        origin: "ORD",
        dest: "HND",
        schedDepUtc: "2026-10-15T17:00:00Z",
      },
      {
        carrier: "JL",
        flightNumber: "720",
        origin: "HND",
        dest: "SGN",
        schedDepUtc: "2026-10-16T10:00:00Z",
      },
    ]);
    expect(uaNh).not.toBe(uaJl);
    expect(uaNh).toContain("UA881:ORD-HND:2026-10-15T17:00");
    expect(uaNh).toContain("NH891:HND-SGN:2026-10-16T09:00");
  });

  it("is deterministic across calls", () => {
    const segs = [
      {
        carrier: "DL",
        flightNumber: "100",
        origin: "ATL",
        dest: "MCO",
        schedDepUtc: "2026-09-01T14:30:00.000Z",
      },
    ];
    expect(buildOptionKey(segs)).toBe(buildOptionKey(segs));
  });
});

describe("Travel Access resolveTravelAccess", () => {
  it("recognizes home airline without inventing UA", () => {
    const r = resolveTravelAccess({
      homeAirline: "DL",
      airlineAccess: ["DL"],
      accessMode: "home",
      airlineAccessMeta: {},
    });
    expect(r.homeAirline).toBe("DL");
    expect(r.codes).toEqual(["DL"]);
    expect(r.meta["DL"]?.type).toBe("home");
  });

  it("does not default missing home to UA", () => {
    const r = resolveTravelAccess({
      homeAirline: "",
      airlineAccess: [],
      accessMode: null,
    });
    expect(r.homeAirline).toBeNull();
    expect(r.codes).toEqual([]);
  });

  it("types partners picks as zed", () => {
    const meta = buildAccessMetaFromDraft({
      homeAirline: "LH",
      accessMode: "partners",
      airlineAccess: ["AC", "UA"],
    });
    expect(meta["LH"]?.type).toBe("home");
    expect(meta["AC"]?.type).toBe("zed");
    expect(meta["UA"]?.type).toBe("zed");
  });

  it("never expands client preference beyond saved access", () => {
    const saved = resolveTravelAccess({
      homeAirline: "UA",
      airlineAccess: ["UA", "NH", "LH"],
      accessMode: "partners",
      airlineAccessMeta: {
        UA: { type: "home" },
        NH: { type: "zed" },
        LH: { type: "zed" },
      },
    });
    expect(effectiveStaffTravelCarriers(saved, ["UA", "NH"])).toEqual(["UA", "NH"]);
    expect(effectiveStaffTravelCarriers(saved, ["UA", "CX"])).toEqual(["UA"]);
    expect(effectiveStaffTravelCarriers(saved, ["CX", "VN"])).toEqual([]);
    expect(effectiveStaffTravelCarriers(saved, null).sort()).toEqual(["LH", "NH", "UA"]);
  });

  it("legacy airline_access codes without meta become other (or zed for partners)", () => {
    const other = resolveTravelAccess({
      homeAirline: "WN",
      airlineAccess: ["WN", "AA"],
      accessMode: "selected",
    });
    expect(other.meta["AA"]?.type).toBe("other");

    const zed = resolveTravelAccess({
      homeAirline: "UA",
      airlineAccess: ["UA", "NH"],
      accessMode: "partners",
    });
    expect(zed.meta["NH"]?.type).toBe("zed");
  });
});

describe("FAA coverage country", () => {
  it("treats US as covered and international as not", () => {
    expect(isFaaCoverageCountry("US")).toBe(true);
    expect(isFaaCoverageCountry("DE")).toBe(false);
    expect(isFaaCoverageCountry("JP")).toBe(false);
    expect(isFaaCoverageCountry(null)).toBe(false);
  });
});
