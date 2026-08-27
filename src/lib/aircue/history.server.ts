/**
 * Historical context layer (free BTS data, precomputed into hist_* tables).
 *
 * This is CONTEXT only: it never describes today's seats, list position, or
 * clearance odds. Every figure carries its source period and publication lag.
 */

import { TIME_BLOCKS, timeBlockShort } from "@/lib/aircue/history";
import type {
  HistoryLoadRow,
  HistoryPatternRow,
  RouteHistory,
} from "@/lib/aircue/history";

export type { HistoryLoadRow, HistoryPatternRow, RouteHistory };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DOWS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function timeBlockFor(hour: number): string {
  if (hour < 11) return "morning";
  if (hour < 16) return "midday";
  if (hour < 21) return "evening";
  return "late";
}

export const timeBlockLabel: Record<string, string> = {
  morning: "morning departures",
  midday: "midday departures",
  evening: "evening departures",
  late: "late-night departures",
};

interface OntimeRow {
  month: number;
  year: number | null;
  dow: number | null;
  time_block: string | null;
  flights_sampled: number;
  cancel_rate: number;
  dep15_rate: number;
  median_later_backups: number;
  source_period: string;
}

interface T100Row {
  year: number;
  month: number;
  departures: number;
  load_factor: number;
  avg_empty_seats: number;
  vs_network_pp: number | null;
  source_period: string;
}

function toPattern(row: OntimeRow, label: string): HistoryPatternRow {
  return {
    label,
    cancelRate: Number(row.cancel_rate),
    dep15Rate: Number(row.dep15_rate),
    medianLaterBackups: Number(row.median_later_backups),
    flightsSampled: Number(row.flights_sampled),
    sourcePeriod: row.source_period,
  };
}

function toLoad(row: T100Row, label: string): HistoryLoadRow {
  return {
    label,
    loadFactor: Number(row.load_factor),
    avgEmptySeats: Number(row.avg_empty_seats),
    vsNetworkPp: row.vs_network_pp === null ? null : Number(row.vs_network_pp),
    departures: Number(row.departures),
    sourcePeriod: row.source_period,
  };
}

function ym(year: number, month: number) {
  return year * 12 + month;
}

/**
 * Months of a dataset that are published (available_after has passed), newest first.
 */
async function publishedMonths(
  supabaseAdmin: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          c: string,
          v: string,
        ) => { lte: (c: string, v: string) => Promise<{ data: unknown }> };
      };
    };
  },
  dataset: "ontime" | "t100",
): Promise<{ year: number; month: number }[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = (await supabaseAdmin
    .from("hist_dataset_months")
    .select("year,month,available_after")
    .eq("dataset", dataset)
    .lte("available_after", today)) as { data: { year: number; month: number }[] | null };
  return (data ?? []).sort((a, b) => ym(b.year, b.month) - ym(a.year, a.month));
}

export async function getRouteHistory(input: {
  origin: string;
  dest: string;
  travelDate: string;
  localHour: number | null;
  carrier?: string | null;
}): Promise<RouteHistory | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const carrier = input.carrier && input.carrier !== "NA" ? input.carrier : "ALL";

  const date = new Date(`${input.travelDate}T12:00:00Z`);
  const month = date.getUTCMonth() + 1;
  const dow = date.getUTCDay() + 1; // 1 = Sunday
  const timeBlock = input.localHour === null ? null : timeBlockFor(input.localHour);

  const [{ data: patternRows }, { data: loadRows }, otMonths, t100Months] = await Promise.all([
    supabaseAdmin
      .from("hist_ontime_pattern")
      .select(
        "month,year,dow,time_block,flights_sampled,cancel_rate,dep15_rate,median_later_backups,source_period",
      )
      .eq("origin_iata", input.origin)
      .eq("dest_iata", input.dest)
      .eq("marketing_carrier", carrier),
    supabaseAdmin
      .from("hist_t100_route_month")
      .select("year,month,departures,load_factor,avg_empty_seats,vs_network_pp,source_period")
      .eq("origin_iata", input.origin)
      .eq("dest_iata", input.dest)
      .eq("marketing_carrier", carrier)
      .order("year", { ascending: false }),
    publishedMonths(supabaseAdmin as never, "ontime"),
    publishedMonths(supabaseAdmin as never, "t100"),
  ]);

  const patterns = (patternRows ?? []) as OntimeRow[];
  const loads = (loadRows ?? []) as T100Row[];
  if (patterns.length === 0 && loads.length === 0) return null;

  const otPublished = new Set(otMonths.map((m) => `${m.year}-${m.month}`));
  const t100Published = new Set(t100Months.map((m) => `${m.year}-${m.month}`));

  const monthName = MONTHS[month - 1] ?? "";
  const dowName = DOWS[dow - 1] ?? "";

  const typicalRow = patterns.find(
    (r) => r.year === null && r.dow === dow && r.time_block === null && r.month === month,
  );
  const blockRowFor = (block: string) =>
    patterns.find(
      (r) => r.year === null && r.dow === null && r.time_block === block && r.month === month,
    );
  const blockRow = timeBlock ? blockRowFor(timeBlock) : undefined;

  const timeBlocks = TIME_BLOCKS.flatMap((block) => {
    const row = blockRowFor(block);
    if (!row) return [];
    return [{ ...toPattern(row, timeBlockShort[block] ?? block), block }];
  });

  const byDow = [1, 2, 3, 4, 5, 6, 7].flatMap((d) => {
    const row = patterns.find(
      (r) => r.year === null && r.dow === d && r.time_block === null && r.month === month,
    );
    if (!row) return [];
    return [{ ...toPattern(row, (DOWS[d - 1] ?? "").slice(0, 3)), dow: d }];
  });

  const sameMonthPriorYears = patterns
    .filter(
      (r) =>
        r.month === month &&
        r.year !== null &&
        r.dow === null &&
        r.time_block === null &&
        otPublished.has(`${r.year}-${r.month}`),
    )
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 4)
    .map((r) => toPattern(r, String(r.year)));

  const recentMonths = patterns
    .filter(
      (r) =>
        r.year !== null &&
        r.dow === null &&
        r.time_block === null &&
        otPublished.has(`${r.year}-${r.month}`),
    )
    .sort((a, b) => ym(a.year ?? 0, a.month) - ym(b.year ?? 0, b.month))
    .slice(-6)
    .map((r) => toPattern(r, `${MONTHS[r.month - 1]?.slice(0, 3)} ${r.year}`));

  const publishedLoads = loads
    .filter((r) => t100Published.has(`${r.year}-${r.month}`))
    .sort((a, b) => ym(b.year, b.month) - ym(a.year, a.month));

  const loadRow = publishedLoads.find((r) => r.month === month);
  const sameMonthLoads = publishedLoads.filter((r) => r.month === month);
  const loadPriorYears = sameMonthLoads.slice(0, 5).map((r) => toLoad(r, String(r.year)));

  const loadRecentMonths = publishedLoads
    .slice(0, 3)
    .reverse()
    .map((r) => toLoad(r, `${MONTHS[r.month - 1]?.slice(0, 3)} ${r.year}`));

  const pool = sameMonthLoads.slice(0, 5);
  const totalDepartures = pool.reduce((sum, r) => sum + Number(r.departures), 0);
  const loadTypical =
    pool.length > 0 && totalDepartures > 0
      ? {
          label: `${monthName}, last ${pool.length} published year${pool.length === 1 ? "" : "s"}`,
          years: pool.length,
          departures: totalDepartures,
          avgEmptySeats:
            pool.reduce((sum, r) => sum + Number(r.avg_empty_seats) * Number(r.departures), 0) /
            totalDepartures,
          loadFactor:
            pool.reduce((sum, r) => sum + Number(r.load_factor) * Number(r.departures), 0) /
            totalDepartures,
          minEmptySeats: Math.min(...pool.map((r) => Number(r.avg_empty_seats))),
          maxEmptySeats: Math.max(...pool.map((r) => Number(r.avg_empty_seats))),
        }
      : null;

  const notes: string[] = [];
  if (otMonths[0]) {
    notes.push(
      `On-time records published through ${MONTHS[otMonths[0].month - 1]} ${otMonths[0].year}.`,
    );
  }
  if (t100Months[0]) {
    notes.push(
      `Seat and passenger counts published through ${MONTHS[t100Months[0].month - 1]} ${t100Months[0].year}.`,
    );
  }

  return {
    origin: input.origin,
    dest: input.dest,
    carrier,
    month,
    monthName,
    dow,
    dowName,
    timeBlock,
    typical: typicalRow ? toPattern(typicalRow, `${dowName}s in ${monthName}`) : null,
    byTimeBlock:
      blockRow && timeBlock
        ? toPattern(blockRow, `${monthName} ${timeBlockLabel[timeBlock] ?? timeBlock}`)
        : null,
    timeBlocks,
    sameMonthPriorYears,
    recentMonths,
    load: loadRow ? toLoad(loadRow, `${monthName} ${loadRow.year}`) : null,
    loadPriorYears,
    loadRecentMonths,
    loadTypical,
    notes,
  };
}
