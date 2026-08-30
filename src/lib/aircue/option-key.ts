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

/** Canonical identity for one flight segment (one leg of an option_key). */
export function buildSegmentKey(segment: OptionKeySegment): string {
  const carrier = normalizeCarrier(segment.carrier);
  const num = normalizeFlightNumber(segment.flightNumber);
  const od = `${segment.origin.toUpperCase()}-${segment.dest.toUpperCase()}`;
  const dep = depKeyFromSched(segment.schedDepUtc, segment.depLocal);
  return `${carrier}${num}:${od}:${dep}`;
}

export function buildOptionKey(segments: OptionKeySegment[]): string {
  if (!segments.length) return "EMPTY";
  return segments.map((s) => buildSegmentKey(s)).join("|");
}

/** Split a persisted option_key into segment keys. */
export function segmentKeysFromOptionKey(optionKey: string | null | undefined): string[] {
  const raw = (optionKey ?? "").trim();
  if (!raw || raw === "EMPTY") return [];
  return raw.split("|").map((s) => s.trim()).filter(Boolean);
}
