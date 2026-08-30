import { describe, expect, it } from "bun:test";

import {
  loadBookingCompareCell,
  publicBookingPresentation,
  publicBookingTake,
} from "@/lib/aircue/public-booking-presentation";
import { pillarDisplayTitle } from "@/lib/aircue/standby";
import { computeLoadEvidence, loadPillarFromEvidence } from "@/lib/aircue/load-evidence";
import {
  partyReadings,
  teachingLoadExample,
} from "@/lib/aircue/onboarding-examples";
import { detectAnchorOptionEvents, type PlanWatchSnapshot } from "@/lib/aircue/plan-watch-events.server";
import type { ReportedLoad, StandbyOption } from "@/lib/aircue/standby";

describe("publicBookingPresentation", () => {
  it("largestShowing=4 → Booking open for 4+, no seat-count claim", () => {
    const p = publicBookingPresentation({ largestShowing: 4, checked: true });
    expect(p.label).toBe("Booking open for 4+");
    expect(p.detail).toContain("party of 4");
    expect(p.label.toLowerCase()).not.toContain("seat");
    expect(p.detail.toLowerCase()).not.toContain("4 seats");
  });

  it("largestShowing=3 → Booking open for 3", () => {
    const p = publicBookingPresentation({ largestShowing: 3, checked: true });
    expect(p.label).toBe("Booking open for 3");
    expect(p.detail).toContain("up to 3 travelers");
  });

  it("largestShowing=2 → Booking open for 2", () => {
    const p = publicBookingPresentation({ largestShowing: 2, checked: true });
    expect(p.label).toBe("Booking open for 2");
    expect(p.detail).toContain("up to 2 travelers");
  });

  it("largestShowing=1 → Solo booking showing, no single seat", () => {
    const p = publicBookingPresentation({ largestShowing: 1, checked: true });
    expect(p.label).toBe("Solo booking showing");
    expect(p.detail.toLowerCase()).not.toContain("single seat");
    expect(p.detail).toContain("1 traveler");
  });

  it("largestShowing=0 → No public booking found, no full/oversold claim", () => {
    const p = publicBookingPresentation({ largestShowing: 0, checked: true });
    expect(p.label).toBe("No public booking found");
    const blob = `${p.label} ${p.detail}`.toLowerCase();
    expect(blob).not.toContain("full");
    expect(blob).not.toContain("oversold");
  });

  it("provider failure → Booking check unavailable, not full", () => {
    const p = publicBookingPresentation({ largestShowing: null, checked: false });
    expect(p.label).toBe("Booking check unavailable");
    expect(p.detail.toLowerCase()).toContain("does not mean the flight is full");
  });

  it("checked but null largest → Booking signal limited", () => {
    const p = publicBookingPresentation({ largestShowing: null, checked: true });
    expect(p.label).toBe("Booking signal limited");
    expect(p.detail).toContain("party-size limit");
  });
});

describe("pillarDisplayTitle source awareness", () => {
  it("option without load → Public booking", () => {
    expect(pillarDisplayTitle("availability", { load: null })).toBe("Public booking");
    expect(pillarDisplayTitle("availability")).toBe("Public booking");
  });

  it("option with load → Reported load", () => {
    expect(pillarDisplayTitle("availability", { load: { openSeats: 4 } })).toBe("Reported load");
  });

  it("non-availability keys keep static titles", () => {
    expect(pillarDisplayTitle("operations", { load: { openSeats: 1 } })).toBe("Operations");
    expect(pillarDisplayTitle("recovery")).toBe("Recovery");
  });
});

describe("loadBookingCompareCell", () => {
  it("shows source per option for mixed evidence", () => {
    expect(
      loadBookingCompareCell({
        hasReportedLoad: false,
        pillarLabel: "Booking open for 4+",
      }),
    ).toBe("Public booking · Booking open for 4+");
    expect(
      loadBookingCompareCell({
        hasReportedLoad: true,
        pillarLabel: "Tight",
      }),
    ).toBe("Reported load · Tight");
    expect(
      loadBookingCompareCell({
        hasReportedLoad: true,
        pillarLabel: "Partial",
      }),
    ).toBe("Reported load · Partial");
  });
});

describe("partial load display vs public booking scoring", () => {
  it("partial load pillar is Partial while public booking copy stays seat-free", () => {
    const NOW = Date.parse("2026-09-01T12:00:00Z");
    const load: ReportedLoad = {
      id: "l1",
      segmentKey: "UA1:ORD-CVG:2026-09-01T10:00",
      flightLabel: "UA1",
      openSeats: 8,
      standbys: null,
      cabin: "economy",
      source: "employee_system",
      partyIncluded: "yes",
      checkedAt: new Date(NOW - 5 * 60_000).toISOString(),
    };
    const evidence = computeLoadEvidence(load, { partySize: 1, now: NOW });
    const pillar = loadPillarFromEvidence(evidence);
    expect(pillar.label).toBe("Partial");
    expect(pillarDisplayTitle("availability", { load })).toBe("Reported load");
    const publicCopy = publicBookingPresentation({ largestShowing: 4, checked: true });
    expect(publicCopy.label).toBe("Booking open for 4+");
  });
});

describe("watch public booking events", () => {
  function option(partial: Partial<StandbyOption> & { id: string }): StandbyOption {
    return {
      planId: "plan-1",
      rank: 1,
      kind: "nonstop",
      judgment: "mixed",
      confidence: "medium",
      headline: "h",
      optionKey: null,
      carrier: "UA",
      flightNumber: "1",
      flightLabel: "UA1",
      origin: "ORD",
      dest: "CVG",
      depLocal: "1:00 PM",
      arrLocal: "3:00 PM",
      schedDepUtc: null,
      segments: [],
      pillars: [],
      reasons: [],
      evidence: {
        availability: { checked: true, tested: [], largestShowing: 1, checkedAt: null },
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
      },
      load: null,
      refreshedAt: new Date().toISOString(),
      ...partial,
    };
  }

  it("largestShowing decrease uses Public booking terminology, no full claim", () => {
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: {},
      largestShowing: 4,
      laterCount: 1,
    };
    const fresh = option({
      id: "a",
      evidence: {
        availability: { checked: true, tested: [], largestShowing: 2, checkedAt: null },
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
      },
    });
    const events = detectAnchorOptionEvents(prev, fresh);
    const avail = events.find((e) => e.kind === "availability");
    expect(avail?.headline).toBe("Public booking tightened");
    expect(avail?.detail).toContain("commercial booking signal");
    expect(avail?.detail.toLowerCase()).not.toContain("full");
    expect(avail?.detail.toLowerCase()).not.toContain("oversold");
  });

  it("largestShowing → 0 → No public booking found, not full/oversold proof", () => {
    const prev: PlanWatchSnapshot = {
      judgment: "mixed",
      pillars: {},
      largestShowing: 2,
      laterCount: 1,
    };
    const fresh = option({
      id: "a",
      evidence: {
        availability: { checked: true, tested: [], largestShowing: 0, checkedAt: null },
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
      },
    });
    const events = detectAnchorOptionEvents(prev, fresh);
    const avail = events.find((e) => e.kind === "availability");
    expect(avail?.headline).toBe("No public booking found");
    expect(avail?.detail).toContain("does not prove the flight is full or oversold");
  });
});

describe("onboarding partyReadings match partyIncluded semantics", () => {
  it("teaching examples match computeLoadEvidence exactly", () => {
    const NOW = Date.parse("2026-09-01T12:00:00Z");
    for (const reading of partyReadings) {
      const load: ReportedLoad = {
        id: "teach",
        segmentKey: "UA1:ORD-LAX:2026-09-01T10:00",
        flightLabel: "UA1",
        openSeats: teachingLoadExample.openSeats,
        standbys: teachingLoadExample.standbys,
        cabin: "economy",
        source: "employee_system",
        partyIncluded: reading.partyIncluded,
        checkedAt: new Date(NOW - 5 * 60_000).toISOString(),
      };
      const evidence = computeLoadEvidence(load, {
        partySize: reading.partySize,
        now: NOW,
      });
      const pillar = loadPillarFromEvidence(evidence);
      expect(pillar.state).toBe(reading.state);
    }
  });
});

describe("publicBookingTake", () => {
  it("does not claim open standby seats for 4+", () => {
    const take = publicBookingTake(4, true);
    expect(take).toContain("not proof of open standby seats");
  });
});
