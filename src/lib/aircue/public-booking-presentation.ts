/**
 * Client-safe pure copy for the public booking (GF8) probe.
 *
 * Answers only: how large a party the public booking flow still shows as bookable.
 * Never implies physical seats, standby load, fullness, or clearance odds.
 */

export type PublicBookingPresentationInput = {
  /** Largest party size still showing bookable, or null when ambiguous. */
  largestShowing: number | null;
  /**
   * Whether a booking check completed.
   * `false` / omitted with null largest → provider/board failure wording.
   * `true` with null largest → ambiguous / limited signal.
   */
  checked?: boolean;
};

export type PublicBookingPresentation = {
  label: string;
  detail: string;
};

/**
 * Canonical user-facing label + detail for public booking evidence.
 * Shared by ranking, the public-booking detail page, compare cells, and tests.
 */
export function publicBookingPresentation(
  input: PublicBookingPresentationInput,
): PublicBookingPresentation {
  const { largestShowing: largest } = input;
  const checked = input.checked ?? largest !== null;

  if (!checked) {
    return {
      label: "Booking check unavailable",
      detail:
        "We couldn't complete the public booking check. That does not mean the flight is full.",
    };
  }

  if (largest === null) {
    return {
      label: "Booking signal limited",
      detail:
        "Public booking is showing, but Standbye couldn't determine the current party-size limit.",
    };
  }

  if (largest >= 4) {
    return {
      label: "Booking open for 4+",
      detail: "Public booking is still accepting a party of 4.",
    };
  }

  if (largest === 3) {
    return {
      label: "Booking open for 3",
      detail: "Public booking currently shows for parties up to 3 travelers.",
    };
  }

  if (largest === 2) {
    return {
      label: "Booking open for 2",
      detail: "Public booking currently shows for parties up to 2 travelers.",
    };
  }

  if (largest === 1) {
    return {
      label: "Solo booking showing",
      detail: "Public booking currently shows for 1 traveler, but not a larger party.",
    };
  }

  return {
    label: "No public booking found",
    detail: "We couldn't find even a 1-traveler booking for this flight right now.",
  };
}

/** Compact StandbyeTake lines for the public-booking detail page. */
export function publicBookingTake(largestShowing: number | null, checked: boolean): string {
  if (!checked) {
    return "We couldn't complete the public booking check. That does not mean the flight is full.";
  }
  if (largestShowing === null) {
    return "Public booking is showing, but Standbye couldn't determine the current party-size limit.";
  }
  if (largestShowing >= 4) {
    return "Public booking is still open to the largest party Standbye currently checks. Useful evidence — but not proof of open standby seats.";
  }
  if (largestShowing >= 2) {
    return "Public booking is accepting smaller parties but not the larger ones Standbye checked. That's a tighter commercial signal.";
  }
  return "Public booking is very constrained or no longer showing in our check. That still does not tell us the actual standby load.";
}

/**
 * Compare-table cell text: source · observation.
 * Uses the availability pillar's stored label (public booking or load-derived).
 */
export function loadBookingCompareCell(input: {
  hasReportedLoad: boolean;
  pillarLabel: string | null | undefined;
}): string {
  const source = input.hasReportedLoad ? "Reported load" : "Public booking";
  const label = (input.pillarLabel ?? "").trim() || "Unknown";
  return `${source} · ${label}`;
}
