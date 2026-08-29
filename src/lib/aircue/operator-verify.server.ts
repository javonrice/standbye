/**
 * Lazy AeroDataBox flight/operator verification (V2.1 §9).
 * Called only on primary set / watched-primary recheck — never verify-all.
 */
import { fetchFlightStatus, type AdbFlight } from "@/lib/aircue/aerodatabox.server";
import {
  resolveStaffEligibility,
  type OperatorVerification,
  type StaffEligibility,
} from "@/lib/aircue/staff-eligibility";
import type { AccessType, AirlineAccessMeta } from "@/lib/aircue/travel-access";
import { accessTypeForCarrier } from "@/lib/aircue/travel-access";

export interface OperatorTruthResult {
  staffEligibility: StaffEligibility;
  operatorVerification: OperatorVerification;
  /** Operator IATA codes when known. */
  operatorCarriers: string[];
  /** Access retyped from operator when verified; else null. */
  accessFromOperator: AccessType | null;
  /** Whether an ADB call was attempted. */
  attempted: boolean;
}

/** Optional codeshare fields — present on some AeroDataBox payloads. */
function codeshareStatusOf(flight: AdbFlight): string | null {
  const raw = (flight as AdbFlight & { codeshareStatus?: string }).codeshareStatus;
  return raw ? String(raw) : null;
}

function operatorIataOf(flight: AdbFlight): string | null {
  const iata = flight.airline?.iata?.trim().toUpperCase();
  return iata && /^[A-Z0-9]{2,3}$/.test(iata) ? iata : null;
}

/**
 * Verify operating carrier for one marketing flight number/date/leg.
 * Maps onto the locked eligibility table — never invents ineligible from failure.
 */
export async function verifyOperatorForFlight(input: {
  flightNumber: string;
  travelDate: string;
  origin?: string;
  dest?: string;
  allowedAccess: string[];
  accessMeta?: AirlineAccessMeta;
  force?: boolean;
}): Promise<OperatorTruthResult> {
  const checkedAt = new Date().toISOString();
  const source = "aerodatabox";

  try {
    const { flight, budgetBlocked } = await fetchFlightStatus(input.flightNumber, input.travelDate, {
      force: input.force ?? true,
      origin: input.origin,
      dest: input.dest,
    });

    if (budgetBlocked && !flight) {
      const resolved = resolveStaffEligibility({
        allowedAccess: input.allowedAccess,
        verifyAttempted: true,
        verifyFailed: true,
        checkedAt,
        source,
      });
      return {
        ...resolved,
        operatorCarriers: [],
        accessFromOperator: null,
        attempted: true,
      };
    }

    if (!flight) {
      const resolved = resolveStaffEligibility({
        allowedAccess: input.allowedAccess,
        verifyAttempted: true,
        verifyFailed: true,
        checkedAt,
        source,
      });
      return {
        ...resolved,
        operatorCarriers: [],
        accessFromOperator: null,
        attempted: true,
      };
    }

    const codeshare = codeshareStatusOf(flight);
    if (codeshare && /unknown/i.test(codeshare)) {
      const resolved = resolveStaffEligibility({
        allowedAccess: input.allowedAccess,
        verifyAttempted: true,
        operatorDeterminable: false,
        checkedAt,
        source,
      });
      return {
        ...resolved,
        operatorCarriers: [],
        accessFromOperator: null,
        attempted: true,
      };
    }

    const op = operatorIataOf(flight);
    if (!op) {
      const resolved = resolveStaffEligibility({
        allowedAccess: input.allowedAccess,
        verifyAttempted: true,
        operatorDeterminable: false,
        checkedAt,
        source,
      });
      return {
        ...resolved,
        operatorCarriers: [],
        accessFromOperator: null,
        attempted: true,
      };
    }

    const resolved = resolveStaffEligibility({
      allowedAccess: input.allowedAccess,
      verifyAttempted: true,
      operatorCarriers: [op],
      operatorDeterminable: true,
      checkedAt,
      source,
    });

    const accessFromOperator = input.accessMeta
      ? accessTypeForCarrier(input.accessMeta, op)
      : null;

    return {
      ...resolved,
      operatorCarriers: [op],
      accessFromOperator,
      attempted: true,
    };
  } catch (error) {
    console.error("[verifyOperatorForFlight]", error);
    const resolved = resolveStaffEligibility({
      allowedAccess: input.allowedAccess,
      verifyAttempted: true,
      verifyFailed: true,
      checkedAt,
      source,
    });
    return {
      ...resolved,
      operatorCarriers: [],
      accessFromOperator: null,
      attempted: true,
    };
  }
}
