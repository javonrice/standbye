/**
 * Pass B — GF8 candidates, access filter, eligibility, access-aware scoring, history bands.
 */
import { describe, expect, it } from "bun:test";

import {
  accessFrictionPoints,
  applyAccessAwareScore,
  classifyHistoryLoadFactor,
  clearsFrictionPoints,
  worstAccess,
} from "@/lib/aircue/access-scoring";
import {
  filterCandidatesByAccess,
  normalizeGf8FlightForTest,
  validateItinerarySegments,
} from "@/lib/aircue/gf8-itineraries.server";
import {
  preVerifyEligibility,
  resolveStaffEligibility,
} from "@/lib/aircue/staff-eligibility";

describe("GF8 itinerary integrity", () => {
  it("rejects incomplete segment times without fabricating", () => {
    const result = validateItinerarySegments([
      {
        carrier: "LH",
        flightNumber: "400",
        flightLabel: "LH400",
        origin: "FRA",
        dest: "SIN",
        depLocal: "10:00 AM",
        arrLocal: "",
        schedDepUtc: "2026-10-01T08:00",
        schedArrUtc: "",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_times");
  });

  it("rejects OD breaks between segments", () => {
    const result = validateItinerarySegments([
      {
        carrier: "UA",
        flightNumber: "881",
        flightLabel: "UA881",
        origin: "ORD",
        dest: "HND",
        depLocal: "12:00 PM",
        arrLocal: "3:00 PM",
        schedDepUtc: "2026-10-01T17:00",
        schedArrUtc: "2026-10-02T06:00",
      },
      {
        carrier: "NH",
        flightNumber: "891",
        flightLabel: "NH891",
        origin: "NRT",
        dest: "SGN",
        depLocal: "6:00 PM",
        arrLocal: "10:00 PM",
        schedDepUtc: "2026-10-02T09:00",
        schedArrUtc: "2026-10-02T13:00",
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("od_break");
  });

  it("normalizes a valid multi-segment GF8 flight with fare metadata", () => {
    const cand = normalizeGf8FlightForTest({
      price: "842.50",
      currency: "USD",
      bookingUrl: "https://example.test/book",
      segments: [
        {
          from: "FRA",
          to: "SIN",
          departure: "2026-11-01T09:00:00",
          arrival: "2026-11-01T22:30:00",
          airline: "LH",
          flight_number: "778",
        },
      ],
    });
    expect(cand).not.toBeNull();
    expect(cand!.kind).toBe("nonstop");
    expect(cand!.carriers).toEqual(["LH"]);
    expect(cand!.standbyClears).toBe(1);
    expect(cand!.commercialFare).toEqual({
      amount: 842.5,
      currency: "USD",
      bookingUrl: "https://example.test/book",
    });
    expect(cand!.optionKey).toContain("LH778:FRA-SIN:2026-11-01T09:00");
  });

  it("filters candidates to declared access only (no alliance expansion)", () => {
    const base = normalizeGf8FlightForTest({
      segments: [
        {
          from: "HND",
          to: "SIN",
          departure: "2026-11-01T10:00:00",
          arrival: "2026-11-01T16:00:00",
          airline: "NH",
          flight_number: "801",
        },
      ],
    })!;
    const ua = normalizeGf8FlightForTest({
      segments: [
        {
          from: "HND",
          to: "SIN",
          departure: "2026-11-01T11:00:00",
          arrival: "2026-11-01T17:00:00",
          airline: "UA",
          flight_number: "37",
        },
      ],
    })!;
    const kept = filterCandidatesByAccess([base, ua], ["NH", "JL"]);
    expect(kept.map((c) => c.carriers[0])).toEqual(["NH"]);
  });

  it("returns empty when access set is empty (no staff-travel all)", () => {
    const cand = normalizeGf8FlightForTest({
      segments: [
        {
          from: "ATL",
          to: "MCO",
          departure: "2026-09-01T14:00:00",
          arrival: "2026-09-01T16:00:00",
          airline: "DL",
          flight_number: "100",
        },
      ],
    })!;
    expect(filterCandidatesByAccess([cand], [])).toEqual([]);
    expect(filterCandidatesByAccess([cand], null)).toEqual([]);
  });
});

describe("staff eligibility model", () => {
  it("pre-verify is uncertain + unverified", () => {
    const r = preVerifyEligibility();
    expect(r.staffEligibility).toBe("uncertain");
    expect(r.operatorVerification.status).toBe("unverified");
  });

  it("verified operators inside access → eligible", () => {
    const r = resolveStaffEligibility({
      allowedAccess: ["LH", "UA"],
      verifyAttempted: true,
      operatorCarriers: ["LH"],
      operatorDeterminable: true,
      checkedAt: "2026-08-29T12:00:00Z",
      source: "aerodatabox",
    });
    expect(r.staffEligibility).toBe("eligible");
    expect(r.operatorVerification.status).toBe("verified");
  });

  it("verified operators outside access → ineligible", () => {
    const r = resolveStaffEligibility({
      allowedAccess: ["LH"],
      verifyAttempted: true,
      operatorCarriers: ["BA"],
      operatorDeterminable: true,
    });
    expect(r.staffEligibility).toBe("ineligible");
    expect(r.operatorVerification.status).toBe("verified");
  });

  it("provider failure alone never yields ineligible", () => {
    const r = resolveStaffEligibility({
      allowedAccess: ["UA"],
      verifyAttempted: true,
      verifyFailed: true,
    });
    expect(r.staffEligibility).toBe("uncertain");
    expect(r.operatorVerification.status).toBe("unknown");
  });

  it("undeterminable operator → uncertain + unknown", () => {
    const r = resolveStaffEligibility({
      allowedAccess: ["UA"],
      verifyAttempted: true,
      operatorDeterminable: false,
    });
    expect(r.staffEligibility).toBe("uncertain");
    expect(r.operatorVerification.status).toBe("unknown");
  });
});

describe("access-aware scoring", () => {
  it("applies modest home < zed < other friction without hard order", () => {
    expect(accessFrictionPoints("home")).toBe(0);
    expect(accessFrictionPoints("zed")).toBe(-6);
    expect(accessFrictionPoints("other")).toBe(-12);
    expect(accessFrictionPoints("home")).toBeGreaterThan(accessFrictionPoints("zed"));
    expect(accessFrictionPoints("zed")).toBeGreaterThan(accessFrictionPoints("other"));
  });

  it("generalizes connection −12 via standbyClears = segment count", () => {
    expect(clearsFrictionPoints(1)).toBe(0);
    expect(clearsFrictionPoints(2)).toBe(-12);
    expect(clearsFrictionPoints(3)).toBe(-24);
  });

  it("allows strong ZED to beat weak home on equal clears", () => {
    const homeWeak = applyAccessAwareScore(60, "home", 1);
    const zedStrong = applyAccessAwareScore(80, "zed", 1);
    expect(zedStrong).toBeGreaterThan(homeWeak);
  });

  it("uses worst segment access for itinerary friction", () => {
    expect(worstAccess(["home", "zed"])).toBe("zed");
    expect(worstAccess(["home", "other", "zed"])).toBe("other");
    expect(worstAccess([null, "home"])).toBe("home");
  });
});

describe("history load-factor bands", () => {
  it("evaluates ≥0.93 before ≥0.87", () => {
    expect(classifyHistoryLoadFactor(0.93).state).toBe("poor");
    expect(classifyHistoryLoadFactor(0.93).label).toBe("Very tight");
    expect(classifyHistoryLoadFactor(0.9).state).toBe("fair");
    expect(classifyHistoryLoadFactor(0.87).state).toBe("fair");
    expect(classifyHistoryLoadFactor(0.86).state).toBe("good");
  });

  it("missing history is unavailable, not positive", () => {
    const r = classifyHistoryLoadFactor(null);
    expect(r.state).toBe("unknown");
    expect(r.label).toBe("Historical pattern unavailable");
  });
});
