/** Client-safe types for the historical (BTS) context layer. */

export interface HistoryPatternRow {
  label: string;
  /** Departure window key when this row is a time-block row. */
  block?: string;
  /** 1 = Sunday, when this row is a day-of-week row. */
  dow?: number;
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

export interface HistoryLoadTypical {
  label: string;
  years: number;
  departures: number;
  avgEmptySeats: number;
  loadFactor: number;
  minEmptySeats: number;
  maxEmptySeats: number;
}

export const TIME_BLOCKS = ["morning", "midday", "evening", "late"] as const;

export type TimeBlock = (typeof TIME_BLOCKS)[number];

/** Short, plain-language names for each departure window. */
export const timeBlockShort: Record<string, string> = {
  morning: "Morning",
  midday: "Afternoon",
  evening: "Evening",
  late: "Night",
};

/** Local-time range each departure window covers. */
export const timeBlockRange: Record<string, string> = {
  morning: "before 11am",
  midday: "11am – 4pm",
  evening: "4pm – 9pm",
  late: "after 9pm",
};

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
  /** Every departure window for this month, morning → night. */
  timeBlocks: HistoryPatternRow[];
  /** Every day of the week for this month, Sunday → Saturday. */
  byDow: HistoryPatternRow[];
  /** Same month in prior published years, newest first. */
  sameMonthPriorYears: HistoryPatternRow[];
  /** Most recent published months leading up to today, oldest first. */
  recentMonths: HistoryPatternRow[];
  /** How full this route typically ran in this month (T-100). */
  load: HistoryLoadRow | null;
  loadPriorYears: HistoryLoadRow[];
  /** Most recent published months of seat data, oldest first. */
  loadRecentMonths: HistoryLoadRow[];
  /** Seat math pooled across the last few published years of this month. */
  loadTypical: HistoryLoadTypical | null;
  notes: string[];
}
