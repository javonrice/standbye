/** Client-safe types for the historical (BTS) context layer. */

export interface HistoryPatternRow {
  label: string;
  cancelRate: number;
  dep15Rate: number;
  medianLaterBackups: number;
  flightsSampled: number;
  sourcePeriod: string;
}

export interface HistoryLoadRow {
  label: string;
  loadFactor: number;
  avgEmptySeats: number;
  vsNetworkPp: number | null;
  departures: number;
  sourcePeriod: string;
}

export interface RouteHistory {
  origin: string;
  dest: string;
  /** Marketing airline the figures cover, or "ALL" when pooled. */
  carrier: string;
  month: number;
  monthName: string;
  dow: number;
  dowName: string;
  timeBlock: string | null;
  /** Pooled multi-year baseline for this month + day of week. */
  typical: HistoryPatternRow | null;
  /** Pooled baseline for this month + departure time block. */
  byTimeBlock: HistoryPatternRow | null;
  /** Same month in prior published years, newest first. */
  sameMonthPriorYears: HistoryPatternRow[];
  /** Most recent published months leading up to today, oldest first. */
  recentMonths: HistoryPatternRow[];
  /** How full this route typically ran in this month (T-100). */
  load: HistoryLoadRow | null;
  loadPriorYears: HistoryLoadRow[];
  notes: string[];
}
