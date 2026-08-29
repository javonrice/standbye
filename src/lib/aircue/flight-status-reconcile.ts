/**
 * Reconcile ADB flight-number status with airport-board (FIDS) evidence.
 * Number-status wins when decisive; FIDS fills hard-cancel when status is Unknown.
 */

export type ReconciledPrimaryState =
  | "operating"
  | "delayed"
  | "cancelled"
  | "departed"
  | "unknown";

export type StatusSource = "status" | "fids" | "reconciled";

export interface ReconcileInput {
  /** Normalized from number-status endpoint (may be null/unavailable). */
  numberStatus: ReconciledPrimaryState | null;
  /** Raw FIDS status string for the same flight on the board, if found. */
  fidsStatusRaw?: string | null;
}

export interface ReconcileResult {
  state: ReconciledPrimaryState;
  source: StatusSource;
  boardConflict: boolean;
  /** True when FIDS alone justifies a primary cancellation event. */
  emitCancellationFromBoard: boolean;
}

function normalizeFids(raw: string | null | undefined): {
  hardCancel: boolean;
  uncertainCancel: boolean;
  operating: boolean;
} {
  const s = (raw ?? "").toLowerCase();
  const cancel = s.includes("cancel");
  const uncertain = cancel && s.includes("uncertain");
  const hardCancel = cancel && !uncertain;
  const operating =
    !cancel &&
    (s.includes("scheduled") ||
      s.includes("expected") ||
      s.includes("depart") ||
      s.includes("enroute") ||
      s.includes("arriv") ||
      s.includes("delay") ||
      s.length > 0);
  return { hardCancel, uncertainCancel: uncertain, operating };
}

/**
 * Deterministic primary reconciliation (plan §6).
 */
export function reconcilePrimaryFlightStatus(input: ReconcileInput): ReconcileResult {
  const fids = normalizeFids(input.fidsStatusRaw);
  const num = input.numberStatus;

  if (num === "cancelled") {
    return {
      state: "cancelled",
      source: "status",
      boardConflict: false,
      emitCancellationFromBoard: false,
    };
  }

  if (num === "operating" || num === "delayed" || num === "departed") {
    const conflict = fids.hardCancel || fids.uncertainCancel;
    return {
      state: num,
      source: "status",
      boardConflict: conflict,
      emitCancellationFromBoard: false,
    };
  }

  // Unknown / missing number-status
  if (fids.hardCancel) {
    return {
      state: "cancelled",
      source: "fids",
      boardConflict: false,
      emitCancellationFromBoard: true,
    };
  }

  if (fids.uncertainCancel) {
    return {
      state: "unknown",
      source: "reconciled",
      boardConflict: false,
      emitCancellationFromBoard: false,
    };
  }

  if (num == null) {
    return {
      state: fids.operating ? "operating" : "unknown",
      source: fids.operating ? "reconciled" : "status",
      boardConflict: false,
      emitCancellationFromBoard: false,
    };
  }

  return {
    state: "unknown",
    source: "status",
    boardConflict: false,
    emitCancellationFromBoard: false,
  };
}

/** Map provider FlightStatus.state into reconcile states. */
export function flightStatusToReconcileState(
  state: "scheduled" | "delayed" | "cancelled" | "departed" | "diverted" | null | undefined,
): ReconciledPrimaryState | null {
  if (!state) return null;
  if (state === "cancelled") return "cancelled";
  if (state === "departed" || state === "diverted") return "departed";
  if (state === "delayed") return "delayed";
  if (state === "scheduled") return "operating";
  return "unknown";
}
