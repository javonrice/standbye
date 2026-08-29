/**
 * Feature #1: deterministic cancellation detection helpers.
 */
import { describe, expect, it } from "bun:test";

import type { FlightStatus } from "@/lib/aircue/flight-provider.server";
import type { StandbyOption } from "@/lib/aircue/standby";
import {
  cancellationEvent,
  classifyFlightStatus,
  shouldEmitCancellation,
  watchFlightIdentity,
} from "@/lib/aircue/watch-flight-state.server";

function status(state: FlightStatus["state"], label?: string): FlightStatus {
  return { state, label: label ?? state };
}

const BASE_OPTION: StandbyOption = {
  id: "opt-1",
  planId: "plan-1",
  rank: 1,
  kind: "nonstop",
  judgment: "mixed",
  confidence: "medium",
  headline: "Test",
  flightLabel: "UA782",
  optionKey: "UA782:ORD-SFO:2026-08-29T22:10",
  carrier: "UA",
  flightNumber: "782",
  origin: "ORD",
  dest: "SFO",
  depLocal: "17:10",
  arrLocal: "19:45",
  schedDepUtc: "2026-08-29T22:10:00Z",
  segments: [],
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
  },
  load: null,
  refreshedAt: new Date().toISOString(),
};

describe("classifyFlightStatus", () => {
  it("maps cancelled to cancelled state", () => {
    const r = classifyFlightStatus(status("cancelled", "Cancelled"));
    expect(r).toEqual({ presence: "confirmed", state: "cancelled", label: "Cancelled" });
  });

  it("maps scheduled and delayed to operating", () => {
    expect(classifyFlightStatus(status("scheduled")).state).toBe("operating");
    expect(classifyFlightStatus(status("delayed", "Delayed 30 min")).state).toBe("operating");
  });

  it("maps departed and diverted to departed", () => {
    expect(classifyFlightStatus(status("departed")).state).toBe("departed");
    expect(classifyFlightStatus(status("diverted")).state).toBe("departed");
  });
});

describe("shouldEmitCancellation", () => {
  it("1. scheduled → cancelled emits once", () => {
    expect(shouldEmitCancellation("operating", "cancelled")).toBe(true);
    expect(shouldEmitCancellation("unknown", "cancelled")).toBe(true);
  });

  it("2. cancelled → cancelled does not re-emit", () => {
    expect(shouldEmitCancellation("cancelled", "cancelled")).toBe(false);
  });

  it("7. scheduled → delayed does not emit", () => {
    expect(shouldEmitCancellation("operating", "operating")).toBe(false);
  });

  it("8. scheduled → departed does not emit cancellation", () => {
    expect(shouldEmitCancellation("operating", "departed")).toBe(false);
  });
});

describe("cancellationEvent", () => {
  it("12. produces meaningful flight_cancelled event", () => {
    const e = cancellationEvent("UA782", "ORD", "SFO");
    expect(e.kind).toBe("flight_cancelled");
    expect(e.severity).toBe("meaningful");
    expect(e.headline).toBe("Your flight was cancelled");
    expect(e.detail).toContain("UA782");
    expect(e.detail).toContain("ORD → SFO");
  });
});

describe("watchFlightIdentity", () => {
  it("uses carrier + flight number + route for nonstops", () => {
    expect(watchFlightIdentity(BASE_OPTION)).toEqual({
      flightNumber: "UA782",
      origin: "ORD",
      dest: "SFO",
    });
  });

  it("6. uses first segment for connections", () => {
    const connection: StandbyOption = {
      ...BASE_OPTION,
      kind: "connection",
      carrier: "UA",
      flightNumber: null,
      flightLabel: "RDU → ORD → IAH",
      origin: "RDU",
      dest: "IAH",
      segments: [
        {
          carrier: "UA",
          flightNumber: "1448",
          flightLabel: "UA1448",
          origin: "RDU",
          dest: "ORD",
          depLocal: "06:00",
          arrLocal: "07:30",
          schedDepUtc: "2026-08-29T10:00:00Z",
        },
        {
          carrier: "UA",
          flightNumber: "1448",
          flightLabel: "UA1448",
          origin: "ORD",
          dest: "IAH",
          depLocal: "09:00",
          arrLocal: "12:00",
          schedDepUtc: "2026-08-29T14:00:00Z",
        },
      ],
    };
    expect(watchFlightIdentity(connection)).toEqual({
      flightNumber: "UA1448",
      origin: "RDU",
      dest: "ORD",
    });
  });

  it("returns null when no flight number is available", () => {
    expect(
      watchFlightIdentity({ ...BASE_OPTION, carrier: null, flightNumber: null, segments: [] }),
    ).toBeNull();
  });
});
