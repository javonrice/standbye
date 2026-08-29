/**
 * Process-local upstream call counters for Watch economics instrumentation.
 * Counts attempted live provider fetches (cache hits do not increment).
 */
export interface ProviderUsageCounters {
  /** Google Flights (gf8) HTTP upstream attempts. */
  gf8Upstream: number;
  /** AeroDataBox FIDS / departures board upstream attempts. */
  adbFidsUpstream: number;
  /** AeroDataBox flight-number status upstream attempts. */
  adbStatusUpstream: number;
  /** Operator-verify invocations that attempted a status fetch. */
  operatorVerifyAttempts: number;
}

function empty(): ProviderUsageCounters {
  return {
    gf8Upstream: 0,
    adbFidsUpstream: 0,
    adbStatusUpstream: 0,
    operatorVerifyAttempts: 0,
  };
}

let counters: ProviderUsageCounters = empty();

export function resetProviderUsage(): void {
  counters = empty();
}

export function snapshotProviderUsage(): ProviderUsageCounters {
  return { ...counters };
}

export function deltaProviderUsage(before: ProviderUsageCounters): ProviderUsageCounters {
  const now = snapshotProviderUsage();
  return {
    gf8Upstream: now.gf8Upstream - before.gf8Upstream,
    adbFidsUpstream: now.adbFidsUpstream - before.adbFidsUpstream,
    adbStatusUpstream: now.adbStatusUpstream - before.adbStatusUpstream,
    operatorVerifyAttempts: now.operatorVerifyAttempts - before.operatorVerifyAttempts,
  };
}

export function noteGf8Upstream(n = 1): void {
  counters.gf8Upstream += n;
}

export function noteAdbFidsUpstream(n = 1): void {
  counters.adbFidsUpstream += n;
}

export function noteAdbStatusUpstream(n = 1): void {
  counters.adbStatusUpstream += n;
}

export function noteOperatorVerifyAttempt(n = 1): void {
  counters.operatorVerifyAttempts += n;
}
