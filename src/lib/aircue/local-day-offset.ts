/**
 * Local calendar-day offset between departure and arrival.
 * Compares calendar dates — never infers from elapsed flight hours alone.
 */

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** True when the ISO-ish string is an absolute instant (Z or numeric offset). */
function isAbsoluteInstant(iso: string): boolean {
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso.trim());
}

/** YYYY-MM-DD from the leading date of an ISO-ish string. */
export function calendarDatePrefix(iso: string | null | undefined): string | null {
  const s = (iso ?? "").trim();
  const m = s.match(DATE_PREFIX);
  return m?.[1] ?? null;
}

/** Whole calendar days from date A to date B (YYYY-MM-DD). */
export function daysBetweenCalendarDates(fromDate: string, toDate: string): number {
  const a = Date.UTC(
    Number(fromDate.slice(0, 4)),
    Number(fromDate.slice(5, 7)) - 1,
    Number(fromDate.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toDate.slice(0, 4)),
    Number(toDate.slice(5, 7)) - 1,
    Number(toDate.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Local calendar date (YYYY-MM-DD) for a scheduled timestamp.
 * - Naive / no-offset ISO → treat date prefix as the local calendar date.
 * - Absolute instant (Z/offset) → requires IANA timeZone for local date.
 */
export function localCalendarDate(
  iso: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const s = (iso ?? "").trim();
  if (!s) return null;
  if (!isAbsoluteInstant(s)) {
    return calendarDatePrefix(s);
  }
  if (!timeZone) return null;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

export interface LocalDayOffsetInput {
  /** Explicit local calendar dates when already known (YYYY-MM-DD). */
  depLocalDate?: string | null | undefined;
  arrLocalDate?: string | null | undefined;
  /** Scheduled departure / arrival ISO-ish (local-naive or absolute). */
  schedDep?: string | null | undefined;
  schedArr?: string | null | undefined;
  /** IANA zones — required only when sched values are absolute instants. */
  depTimeZone?: string | null | undefined;
  arrTimeZone?: string | null | undefined;
}

/**
 * Arrival local calendar day minus departure local calendar day.
 * Returns null when either local date cannot be determined correctly.
 * Does not mutate or rewrite stored timestamps.
 */
export function localArrivalDayOffset(input: LocalDayOffsetInput): number | null {
  const dep =
    (input.depLocalDate && DATE_PREFIX.test(input.depLocalDate)
      ? input.depLocalDate.slice(0, 10)
      : null) ?? localCalendarDate(input.schedDep, input.depTimeZone);
  const arr =
    (input.arrLocalDate && DATE_PREFIX.test(input.arrLocalDate)
      ? input.arrLocalDate.slice(0, 10)
      : null) ?? localCalendarDate(input.schedArr, input.arrTimeZone);
  if (!dep || !arr) return null;
  return daysBetweenCalendarDates(dep, arr);
}

/** Append +N to a local clock label when arrival is N local calendar days later. */
export function formatLocalTimeWithDayOffset(
  localTime: string,
  dayOffset: number | null | undefined,
): string {
  if (!localTime) return localTime;
  if (dayOffset == null) return localTime;
  const n = Math.trunc(dayOffset);
  if (n === 0) return localTime;
  if (n > 0) return `${localTime}+${n}`;
  // Negative offsets are rare (date-line westbound); still show when known.
  return `${localTime}${n}`;
}

/** Convenience for itinerary option / segment display. */
export function formatArrivalClock(input: {
  arrLocal: string;
  schedDep?: string | null | undefined;
  schedArr?: string | null | undefined;
  depTimeZone?: string | null | undefined;
  arrTimeZone?: string | null | undefined;
  depLocalDate?: string | null | undefined;
  arrLocalDate?: string | null | undefined;
}): string {
  const offset = localArrivalDayOffset({
    schedDep: input.schedDep,
    schedArr: input.schedArr,
    depTimeZone: input.depTimeZone,
    arrTimeZone: input.arrTimeZone,
    depLocalDate: input.depLocalDate,
    arrLocalDate: input.arrLocalDate,
  });
  return formatLocalTimeWithDayOffset(input.arrLocal, offset);
}
