/**
 * Coverage vs signal — absence of data is never positive evidence.
 */
export type CoverageState = "available" | "not_covered" | "unavailable" | "unknown";

export type SignalState = "good" | "fair" | "poor" | "unknown";

/** US ISO country codes where FAA NAS disruption feeds apply. */
export function isFaaCoverageCountry(country: string | null | undefined): boolean {
  const c = (country ?? "").toUpperCase();
  return c === "US" || c === "USA" || c === "United States".toUpperCase();
}

export interface SignalCoverage {
  coverage: CoverageState;
  signal: SignalState;
  label: string;
  detail: string;
}
