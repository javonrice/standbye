import { describe, expect, it } from "bun:test";

import {
  flightStatusToReconcileState,
  reconcilePrimaryFlightStatus,
} from "@/lib/aircue/flight-status-reconcile";

describe("reconcilePrimaryFlightStatus", () => {
  it("status cancelled wins over any board", () => {
    const r = reconcilePrimaryFlightStatus({
      numberStatus: "cancelled",
      fidsStatusRaw: "Expected",
    });
    expect(r.state).toBe("cancelled");
    expect(r.source).toBe("status");
    expect(r.emitCancellationFromBoard).toBe(false);
  });

  it("status operating with board cancel → boardConflict, no cancel emit", () => {
    const r = reconcilePrimaryFlightStatus({
      numberStatus: "operating",
      fidsStatusRaw: "Cancelled",
    });
    expect(r.state).toBe("operating");
    expect(r.boardConflict).toBe(true);
    expect(r.emitCancellationFromBoard).toBe(false);
  });

  it("unknown + hard board cancel → cancelled from board", () => {
    const r = reconcilePrimaryFlightStatus({
      numberStatus: null,
      fidsStatusRaw: "Cancelled",
    });
    expect(r.state).toBe("cancelled");
    expect(r.source).toBe("fids");
    expect(r.emitCancellationFromBoard).toBe(true);
  });

  it("unknown + CanceledUncertain → unknown pressure only", () => {
    const r = reconcilePrimaryFlightStatus({
      numberStatus: "unknown",
      fidsStatusRaw: "CanceledUncertain",
    });
    expect(r.state).toBe("unknown");
    expect(r.emitCancellationFromBoard).toBe(false);
  });

  it("maps provider states", () => {
    expect(flightStatusToReconcileState("scheduled")).toBe("operating");
    expect(flightStatusToReconcileState("delayed")).toBe("delayed");
    expect(flightStatusToReconcileState("cancelled")).toBe("cancelled");
  });
});
