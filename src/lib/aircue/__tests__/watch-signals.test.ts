import { describe, expect, it } from "bun:test";

import {
  decideWatchOutcome,
  stampRankOnSignals,
  type WatchSignalState,
} from "@/lib/aircue/watch-signal-gate";
import { nextSafetyRefreshAt, watchRefreshIntervalHours } from "@/lib/aircue/watch-config.server";

function baseSignals(overrides: Partial<WatchSignalState> = {}): WatchSignalState {
  return {
    v: 1,
    checkedAt: "2026-08-29T12:00:00.000Z",
    nextSafetyRefreshAt: "2026-08-30T12:00:00.000Z",
    primary: {
      flightNumber: "UA782",
      origin: "ORD",
      dest: "SFO",
      state: "operating",
      schedDepLocal: "17:10",
      revisedDepLocal: null,
      gate: "C12",
      terminal: "1",
      boardConflict: false,
      source: "status",
    },
    cancelPressure: {
      origin: "ORD",
      date: "2026-08-29",
      windowKey: "adb:fids:v2:ORD:2026-08-29:12:00-23:59",
      byRoute: { "UA:SFO": { count: 0, flightNumbers: [] } },
    },
    environment: {
      faaFingerprint: "abc",
      weatherBand: "clear",
      weatherFingerprint: "w1",
    },
    lastRankAt: "2026-08-29T10:00:00.000Z",
    lastRankTrigger: "bootstrap",
    lastOutcome: "rerank",
    ...overrides,
  };
}

describe("decideWatchOutcome", () => {
  it("bootstraps when no previous signalState", () => {
    const d = decideWatchOutcome(null, baseSignals());
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("bootstrap");
  });

  it("skips when signals are identical", () => {
    const prev = baseSignals();
    const next = baseSignals({ checkedAt: "2026-08-29T12:30:00.000Z" });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("skip");
  });

  it("notify-only on gate change", () => {
    const prev = baseSignals();
    const next = baseSignals({
      primary: { ...baseSignals().primary, gate: "C20" },
    });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("notify-only");
    expect(d.trigger).toBe("gate_changed");
    expect(d.notifyEvents[0]?.kind).toBe("gate_changed");
  });

  it("reranks on primary cancelled", () => {
    const prev = baseSignals();
    const next = baseSignals({
      primary: { ...baseSignals().primary, state: "cancelled" },
    });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("primary_cancelled");
  });

  it("reranks on cancel pressure increase", () => {
    const prev = baseSignals();
    const next = baseSignals({
      cancelPressure: {
        ...baseSignals().cancelPressure,
        byRoute: { "UA:SFO": { count: 1, flightNumbers: ["UA100"] } },
      },
    });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("cancel_pressure");
  });

  it("reranks on FAA fingerprint change", () => {
    const prev = baseSignals();
    const next = baseSignals({
      environment: { ...baseSignals().environment, faaFingerprint: "new" },
    });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("faa");
  });

  it("reranks when safety refresh is due", () => {
    const prev = baseSignals({
      nextSafetyRefreshAt: "2026-08-29T11:00:00.000Z",
    });
    const next = baseSignals();
    const d = decideWatchOutcome(prev, next, {
      now: new Date("2026-08-29T12:00:00.000Z"),
    });
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("safety_refresh");
  });

  it("reranks on delay ≥ 15 minutes", () => {
    const prev = baseSignals();
    const next = baseSignals({
      primary: {
        ...baseSignals().primary,
        revisedDepLocal: "17:30",
      },
    });
    const d = decideWatchOutcome(prev, next);
    expect(d.outcome).toBe("rerank");
    expect(d.trigger).toBe("primary_delay");
  });
});

describe("distance-aware safety refresh", () => {
  it("uses wider intervals farther from departure", () => {
    expect(watchRefreshIntervalHours(100)).toBe(24);
    expect(watchRefreshIntervalHours(48)).toBe(12);
    expect(watchRefreshIntervalHours(12)).toBe(6);
    expect(watchRefreshIntervalHours(3)).toBe(3);
  });

  it("stampRankOnSignals advances nextSafetyRefreshAt", () => {
    const stamped = stampRankOnSignals(
      baseSignals(),
      "bootstrap",
      48,
      new Date("2026-08-29T12:00:00.000Z"),
    );
    expect(stamped.lastOutcome).toBe("rerank");
    expect(stamped.nextSafetyRefreshAt).toBe(
      nextSafetyRefreshAt(48, new Date("2026-08-29T12:00:00.000Z")),
    );
  });
});

describe("economics ledger (quiet watches)", () => {
  it("100 quiet × 2 cycles → ~0 reranks after bootstrap", () => {
    let reranks = 0;
    let skips = 0;
    let gf8 = 0;

    for (let i = 0; i < 100; i++) {
      const bootstrap = decideWatchOutcome(null, baseSignals());
      expect(bootstrap.outcome).toBe("rerank");
      reranks += 1;
      gf8 += 1;

      const stamped = stampRankOnSignals(
        baseSignals(),
        "bootstrap",
        48,
        new Date("2026-08-29T10:00:00.000Z"),
      );
      const second = decideWatchOutcome(
        stamped,
        baseSignals({
          checkedAt: "2026-08-29T10:30:00.000Z",
          lastRankAt: stamped.lastRankAt,
          nextSafetyRefreshAt: stamped.nextSafetyRefreshAt,
        }),
        { now: new Date("2026-08-29T10:30:00.000Z") },
      );
      if (second.outcome === "skip") skips += 1;
      else if (second.outcome === "rerank") {
        reranks += 1;
        gf8 += 1;
      }
    }

    expect(skips).toBe(100);
    expect(reranks).toBe(100); // bootstrap only
    expect(gf8).toBe(100); // one per watch bootstrap, not per quiet cycle
  });

  it("disruption subset reranks; others stay skip", () => {
    const quiet = stampRankOnSignals(
      baseSignals(),
      "bootstrap",
      48,
      new Date("2026-08-29T10:00:00.000Z"),
    );
    const disrupted = decideWatchOutcome(
      quiet,
      baseSignals({
        primary: { ...baseSignals().primary, state: "cancelled" },
        lastRankAt: quiet.lastRankAt,
        nextSafetyRefreshAt: quiet.nextSafetyRefreshAt,
      }),
      { now: new Date("2026-08-29T10:30:00.000Z") },
    );
    const other = decideWatchOutcome(
      quiet,
      baseSignals({
        checkedAt: "2026-08-29T10:30:00.000Z",
        lastRankAt: quiet.lastRankAt,
        nextSafetyRefreshAt: quiet.nextSafetyRefreshAt,
      }),
      { now: new Date("2026-08-29T10:30:00.000Z") },
    );
    expect(disrupted.outcome).toBe("rerank");
    expect(other.outcome).toBe("skip");
  });
});
