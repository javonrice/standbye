/**
 * Env-driven Watch / AeroDataBox economics.
 * Defaults match historical Basic-tier values but must not assume Basic forever.
 */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

export function adbMonthlyUnitBudget(): number {
  return intEnv("AERODATABOX_MONTHLY_UNIT_BUDGET", 600);
}

export function adbSoftStopRemaining(): number {
  return intEnv("AERODATABOX_SOFT_STOP_REMAINING", 50);
}

export function adbMinIntervalMs(): number {
  return intEnv("AERODATABOX_MIN_INTERVAL_MS", 1000);
}

export function adbFidsTtlSeconds(): number {
  return intEnv("AIRCUE_FIDS_TTL_SECONDS", 3600);
}

export function watchStatusTtlSeconds(): number {
  return intEnv("AIRCUE_WATCH_STATUS_TTL_SECONDS", 1200);
}

export function resolveStatusTtlSeconds(): number {
  return intEnv("AIRCUE_RESOLVE_STATUS_TTL_SECONDS", 24 * 3600);
}

/** Starting distance-aware availability refresh bands (hours). Tunable from measurement. */
export function watchRefreshIntervalHours(hoursUntilDeparture: number): number {
  const h = Number.isFinite(hoursUntilDeparture) ? hoursUntilDeparture : 999;
  if (h > 72) return intEnv("AIRCUE_WATCH_REFRESH_GT_72H_HOURS", 24);
  if (h > 24) return intEnv("AIRCUE_WATCH_REFRESH_24_72H_HOURS", 12);
  if (h > 6) return intEnv("AIRCUE_WATCH_REFRESH_6_24H_HOURS", 6);
  return intEnv("AIRCUE_WATCH_REFRESH_LE_6H_HOURS", 3);
}

export function nextSafetyRefreshAt(
  hoursUntilDeparture: number,
  from: Date = new Date(),
): string {
  const hours = watchRefreshIntervalHours(hoursUntilDeparture);
  return new Date(from.getTime() + hours * 3600_000).toISOString();
}
