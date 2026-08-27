/** Timezone + window helpers. All storage is UTC; display uses airport-local tz. */

function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts["year"]),
    Number(parts["month"]) - 1,
    Number(parts["day"]),
    Number(parts["hour"]) % 24,
    Number(parts["minute"]),
    Number(parts["second"]),
  );
  return asUTC - date.getTime();
}

/** Convert a local wall-clock time in `tz` to a UTC instant. */
export function zonedToUtc(dateISO: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y!, (m ?? 1) - 1, d!, hh ?? 0, mm ?? 0);
  let utc = naive;
  for (let i = 0; i < 2; i += 1) utc = naive - tzOffsetMs(new Date(utc), tz);
  return new Date(utc);
}

export function formatLocalTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatLocalDate(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatCountdown(departure: Date, now = new Date()): string {
  const ms = departure.getTime() - now.getTime();
  if (ms <= 0) return "Departure time has passed";
  const mins = Math.round(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `Departs in ${days}d ${hours}h`;
  if (hours > 0) return `Departs in ${hours}h ${rem}m`;
  return `Departs in ${rem}m`;
}

export function formatChecked(date: Date, tz: string): string {
  return `Last checked ${formatLocalTime(date, tz)}`;
}

/** Great-circle distance in km. */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough block time: cruise ~800 km/h plus 30 min taxi buffer. */
export function estimateBlockMinutes(km: number): number {
  return Math.round(km / 13.3) + 30;
}

export interface TripWindows {
  schedDep: Date;
  schedArr: Date;
  depWindowStart: Date;
  depWindowEnd: Date;
  arrWindowEnd: Date;
  /** True when the user did not give a departure time (wider, softer window). */
  approximate: boolean;
}

export function buildWindows(opts: {
  travelDate: string;
  depTime?: string | undefined;
  originTz: string;
  distanceKm: number;
}): TripWindows {
  const approximate = !opts.depTime;
  const schedDep = zonedToUtc(opts.travelDate, opts.depTime ?? "12:00", opts.originTz);
  const block = estimateBlockMinutes(opts.distanceKm);
  const schedArr = new Date(schedDep.getTime() + block * 60000);
  const hour = 3600000;
  return {
    schedDep,
    schedArr,
    depWindowStart: new Date(schedDep.getTime() - (approximate ? 12 : 2) * hour),
    depWindowEnd: new Date(schedDep.getTime() + (approximate ? 12 : 4) * hour),
    arrWindowEnd: new Date(schedArr.getTime() + (approximate ? 12 : 2) * hour),
    approximate,
  };
}

export function overlaps(
  aStart: Date | null,
  aEnd: Date | null,
  bStart: Date,
  bEnd: Date,
): boolean {
  const s = aStart ?? bStart;
  const e = aEnd ?? bEnd;
  return s.getTime() <= bEnd.getTime() && e.getTime() >= bStart.getTime();
}
