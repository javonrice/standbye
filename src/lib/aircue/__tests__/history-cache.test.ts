/**
 * Published-month caching. The month set is read once per dataset per date and
 * shared across every leg of every search; route-history output must be byte
 * identical whether the months came from the DB or the cache.
 */
import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";

const PATTERN_ROWS = [
  {
    month: 3,
    year: null,
    dow: 3,
    time_block: null,
    flights_sampled: 120,
    cancel_rate: 0.02,
    dep15_rate: 0.81,
    median_later_backups: 2,
    source_period: "2024",
  },
  {
    month: 3,
    year: null,
    dow: null,
    time_block: "morning",
    flights_sampled: 60,
    cancel_rate: 0.01,
    dep15_rate: 0.9,
    median_later_backups: 3,
    source_period: "2024",
  },
  {
    month: 3,
    year: 2024,
    dow: null,
    time_block: null,
    flights_sampled: 90,
    cancel_rate: 0.03,
    dep15_rate: 0.78,
    median_later_backups: 1,
    source_period: "2024-03",
  },
];
const T100_ROWS = [
  {
    year: 2024,
    month: 3,
    departures: 300,
    load_factor: 0.86,
    avg_empty_seats: 18,
    vs_network_pp: 1.2,
    source_period: "2024-03",
  },
];
const MONTH_ROWS = [{ year: 2024, month: 3, available_after: "2024-09-01" }];

let monthReads = 0;

/** Minimal thenable query builder: every filter returns itself. */
function builder(rows: unknown[], onAwait?: () => void) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lte", "order", "in"]) {
    chain[method] = () => chain;
  }
  chain["then"] = (resolve: (v: { data: unknown[] }) => unknown) => {
    onAwait?.();
    return Promise.resolve({ data: rows }).then(resolve);
  };
  return chain;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "hist_ontime_pattern") return builder(PATTERN_ROWS);
      if (table === "hist_t100_route_month") return builder(T100_ROWS);
      if (table === "hist_dataset_months")
        return builder(MONTH_ROWS, () => {
          monthReads += 1;
        });
      return builder([]);
    },
  },
}));

const { getRouteHistory, historyStats, __resetHistoryCaches } =
  await import("@/lib/aircue/history.server");

const INPUT = { origin: "DEN", dest: "ORD", travelDate: "2026-03-10", localHour: 9, carrier: "UA" };

afterEach(() => {
  setSystemTime();
  __resetHistoryCaches();
  monthReads = 0;
});

describe("publishedMonths cache", () => {
  it("reads the month set once and reuses it for later legs", async () => {
    setSystemTime(new Date("2026-03-01T12:00:00Z"));
    __resetHistoryCaches();
    monthReads = 0;

    const first = await getRouteHistory(INPUT);
    // Two datasets: ontime + t100.
    expect(monthReads).toBe(2);

    const hitsBefore = historyStats.publishedMonthsCacheHits;
    const second = await getRouteHistory(INPUT);
    expect(monthReads).toBe(2); // no further reads
    expect(historyStats.publishedMonthsCacheHits - hitsBefore).toBe(2);

    // Cached and uncached route history must be identical.
    expect(second).toEqual(first);
  });

  it("re-reads when the date rolls over", async () => {
    setSystemTime(new Date("2026-03-01T23:59:00Z"));
    __resetHistoryCaches();
    monthReads = 0;

    const before = await getRouteHistory(INPUT);
    expect(monthReads).toBe(2);

    setSystemTime(new Date("2026-03-02T00:01:00Z"));
    const after = await getRouteHistory(INPUT);
    expect(monthReads).toBe(4); // new date, new key, fresh read
    expect(after).toEqual(before);
  });

  it("shares one in-flight read between concurrent legs", async () => {
    setSystemTime(new Date("2026-03-01T12:00:00Z"));
    __resetHistoryCaches();
    monthReads = 0;

    const [a, b, c] = await Promise.all([
      getRouteHistory(INPUT),
      getRouteHistory(INPUT),
      getRouteHistory(INPUT),
    ]);
    expect(monthReads).toBe(2);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
