/**
 * Deterministic operator eligibility model (V2.1 §9).
 * Pre-verify → uncertain + unverified; never punitive for not-yet-verified;
 * provider failure alone never yields ineligible.
 */

export type StaffEligibility = "eligible" | "uncertain" | "ineligible";
export type OperatorVerificationStatus = "verified" | "unverified" | "unknown";

export interface OperatorVerification {
  status: OperatorVerificationStatus;
  checkedAt: string | null;
  source: string | null;
  note: string | null;
}

export interface EligibilityInput {
  /** Operating carriers when verification succeeded. */
  operatorCarriers?: string[] | null;
  /** false when provider reports codeshare/operator unknown. */
  operatorDeterminable?: boolean | null;
  /** Whether a verify attempt was made. */
  verifyAttempted?: boolean;
  /** True when the verify call failed (quota/error) — never ineligible from this alone. */
  verifyFailed?: boolean;
  /** Declared staff-travel access set (effective carriers). */
  allowedAccess: string[];
  checkedAt?: string | null;
  source?: string | null;
}

function norm(code: string): string {
  return code.trim().toUpperCase();
}

function allInside(carriers: string[], allowed: Set<string>): boolean {
  return carriers.length > 0 && carriers.every((c) => allowed.has(norm(c)));
}

/** Pre-verify default: still rankable; modest confidence haircut only. */
export function preVerifyEligibility(): {
  staffEligibility: StaffEligibility;
  operatorVerification: OperatorVerification;
} {
  return {
    staffEligibility: "uncertain",
    operatorVerification: {
      status: "unverified",
      checkedAt: null,
      source: null,
      note: null,
    },
  };
}

/**
 * Resolve staffEligibility + operatorVerification from the locked V2.1 table.
 */
export function resolveStaffEligibility(input: EligibilityInput): {
  staffEligibility: StaffEligibility;
  operatorVerification: OperatorVerification;
} {
  const allowed = new Set(input.allowedAccess.map(norm));
  const checkedAt = input.checkedAt ?? null;
  const source = input.source ?? null;

  if (!input.verifyAttempted) {
    return preVerifyEligibility();
  }

  if (input.verifyFailed) {
    return {
      staffEligibility: "uncertain",
      operatorVerification: {
        status: "unknown",
        checkedAt,
        source,
        note: "Operator verification unavailable",
      },
    };
  }

  if (input.operatorDeterminable === false) {
    return {
      staffEligibility: "uncertain",
      operatorVerification: {
        status: "unknown",
        checkedAt,
        source,
        note: "Operator could not be determined",
      },
    };
  }

  const operators = (input.operatorCarriers ?? []).map(norm).filter(Boolean);
  if (operators.length === 0) {
    return {
      staffEligibility: "uncertain",
      operatorVerification: {
        status: "unknown",
        checkedAt,
        source,
        note: "No operator codes returned",
      },
    };
  }

  if (allInside(operators, allowed)) {
    return {
      staffEligibility: "eligible",
      operatorVerification: {
        status: "verified",
        checkedAt,
        source,
        note: null,
      },
    };
  }

  return {
    staffEligibility: "ineligible",
    operatorVerification: {
      status: "verified",
      checkedAt,
      source,
      note: "Operating carrier outside declared travel access",
    },
  };
}
