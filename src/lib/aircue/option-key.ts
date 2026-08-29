/**
 * Deterministic itinerary identity. flight_label remains display-only.
 * Format: CARRIERNUM:ORIG-DEST:YYYY-MM-DDTHH:MM|...
 */
export interface OptionKeySegment {
  carrier: string | null | undefined;
  flightNumber: string | null | undefined;
  origin: string;
  dest: string;
  /** ISO UTC preferred; local accepted if already ISO-like. */
  schedDepUtc: string | null | undefined;
  depLocal?: string | null | undefined;
}

function normalizeCarrier(carrier: string | null | undefined): string {
  return (carrier ?? "XX").trim().toUpperCase() || "XX";
}

function normalizeFlightNumber(num: string | null | undefined): string {
  const digits = String(num ?? "").replace(/\D/g, "");
  return digits || "0";
}

/** Truncate scheduled departure to minute for stable keys. */
export function depKeyFromSched(schedDepUtc: string | null | undefined, depLocal?: string | null): string {
  const raw = (schedDepUtc ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 16);
  }
  // Fall back to a normalized local clock token when UTC missing (still deterministic).
  const local = (depLocal ?? "").trim().toUpperCase();
  if (local) return `LOCAL:${local.replace(/\s+/g, "")}`;
  return "UNKNOWN";
}

export function buildOptionKey(segments: OptionKeySegment[]): string {
  if (!segments.length) return "EMPTY";
  return segments
    .map((s) => {
      const carrier = normalizeCarrier(s.carrier);
      const num = normalizeFlightNumber(s.flightNumber);
      const od = `${s.origin.toUpperCase()}-${s.dest.toUpperCase()}`;
      const dep = depKeyFromSched(s.schedDepUtc, s.depLocal);
      return `${carrier}${num}:${od}:${dep}`;
    })
    .join("|");
}
