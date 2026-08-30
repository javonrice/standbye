/** Contribution authorization: home airline must match extracted flight airline. */

export function normalizeAirlineCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,3}$/.test(c) || c === "ANY" || c === "ALL" || c === "HOME") return null;
  return c;
}

/**
 * Shared LoadSnapshot may be written only when contributor home airline
 * equals the extracted flight's airline. Client airlineHint is never auth.
 */
export function canContributeSharedSnapshot(input: {
  contributorHomeAirline: string | null | undefined;
  extractedAirline: string | null | undefined;
}): boolean {
  const home = normalizeAirlineCode(input.contributorHomeAirline);
  const flight = normalizeAirlineCode(input.extractedAirline);
  if (!home || !flight) return false;
  return home === flight;
}

/** Parse airline from a segment_key like UA123:ORD-LAX:2026-09-01T10:00 */
export function airlineFromSegmentKey(segmentKey: string): string | null {
  const m = /^([A-Z0-9]{2,3})\d+/i.exec(segmentKey.trim());
  return m ? normalizeAirlineCode(m[1]!) : null;
}
