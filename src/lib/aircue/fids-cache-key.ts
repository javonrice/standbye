/**
 * Canonical AeroDataBox FIDS cache identity.
 * Key must include the exact airport / date / window — never a bare "departures" suffix.
 */

/** Extract HH:MM from "HH:MM", "YYYY-MM-DDTHH:MM", or "YYYY-MM-DD HH:MM…". */
export function extractWindowClock(raw: string): string {
  const s = (raw ?? "").trim();
  const iso = s.match(/T(\d{2}:\d{2})/);
  if (iso?.[1]) return iso[1];
  const spaced = s.match(/\s(\d{2}:\d{2})/);
  if (spaced?.[1]) return spaced[1];
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  return "00:00";
}

/**
 * Shared FIDS cache key for schedule and cancellation paths.
 * Format: adb:fids:v2:{IATA}:{YYYY-MM-DD}:{HH:MM}-{HH:MM}
 */
export function fidsCacheKey(
  iata: string,
  travelDate: string,
  windowStartLocal: string,
  windowEndLocal: string,
  direction: "Departure" | "Arrival" = "Departure",
): string {
  const start = extractWindowClock(windowStartLocal);
  const end = extractWindowClock(windowEndLocal);
  return `adb:fids:v2:${iata.trim().toUpperCase()}:${travelDate}:${start}-${end}:${direction}`;
}

/** Shared cancel-lookback window for a local departure clock. */
export function cancelLookbackWindow(
  travelDate: string,
  beforeLocalTime: string,
): { start: string; end: string; windowKey: string } {
  const endMinutes =
    Number(beforeLocalTime.slice(0, 2)) * 60 + Number(beforeLocalTime.slice(3, 5));
  const startMinutes = Math.max(0, endMinutes - 11 * 60);
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const startClock = hhmm(startMinutes);
  const endClock = hhmm(Math.max(startMinutes + 60, endMinutes));
  const start = `${travelDate}T${startClock}`;
  const end = `${travelDate}T${endClock}`;
  return { start, end, windowKey: `${extractWindowClock(start)}-${extractWindowClock(end)}` };
}

/** Prefer fixed day halves when the lookback fits inside one half. */
export function preferredBoardWindow(
  travelDate: string,
  beforeLocalTime: string,
): { start: string; end: string } {
  const hour = Number(beforeLocalTime.slice(0, 2));
  const endMinutes =
    Number(beforeLocalTime.slice(0, 2)) * 60 + Number(beforeLocalTime.slice(3, 5));
  const startMinutes = Math.max(0, endMinutes - 11 * 60);
  if (endMinutes <= 11 * 60 + 59 && startMinutes >= 0 && hour < 12) {
    return { start: `${travelDate}T00:00`, end: `${travelDate}T11:59` };
  }
  if (startMinutes >= 12 * 60) {
    return { start: `${travelDate}T12:00`, end: `${travelDate}T23:59` };
  }
  const custom = cancelLookbackWindow(travelDate, beforeLocalTime);
  return { start: custom.start, end: custom.end };
}
