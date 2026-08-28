/**
 * Holiday lookup resilience: a slow or broken Nager.Date must degrade to "no
 * holiday context" quickly, and a warm cache must not re-request.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";

const AIRPORTS = [
  {
    iata: "ORD",
    icao: "KORD",
    lat: 41.97,
    lon: -87.9,
    city: "Chicago",
    state: "IL",
    tz: "America/Chicago",
  },
  { iata: "XXX", icao: null, lat: 0, lon: 0, city: null, state: null, tz: null },
];

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        in: (_c: string, codes: string[]) =>
          Promise.resolve({ data: AIRPORTS.filter((a) => codes.includes(a.iata)) }),
      }),
    }),
  },
}));

const { holidayFor, holidayStats, __resetHolidayCache } =
  await import("@/lib/aircue/ranking.server");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  __resetHolidayCache();
});

const JULY4 = [{ date: "2026-07-04", name: "Independence Day", localName: "Independence Day" }];

describe("holidayFor", () => {
  it("returns the nearby holiday and caches the country-year list", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(JULY4), { status: 200 });
    }) as typeof fetch;

    const first = await holidayFor("ORD", "2026-07-03");
    // Evidence wording is product-visible; lock it so a perf pass cannot move it.
    expect(first).toEqual({
      country: "🇺🇸 US",
      name: "Independence Day",
      date: "2026-07-04",
      note: "Major holidays can make normal historical demand less useful. AirCue treats this as context, not proof the flight will be full.",
    });
    expect(calls).toBe(1);

    const hitsBefore = holidayStats.cacheHits;
    const second = await holidayFor("ORD", "2026-07-03");
    expect(calls).toBe(1); // served from cache
    expect(holidayStats.cacheHits - hitsBefore).toBe(1);
    expect(second).toEqual(first);
  });

  it("passes an abort signal so a hung request cannot stall the search", async () => {
    let sawSignal = false;
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return new Response(JSON.stringify(JULY4), { status: 200 });
    }) as typeof fetch;

    await holidayFor("ORD", "2026-07-03");
    expect(sawSignal).toBe(true);
  });

  it("aborts a request that never responds and falls back to null", async () => {
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason ?? new Error("aborted")),
        );
      })) as typeof fetch;

    const before = holidayStats.timeouts;
    const started = Date.now();
    expect(await holidayFor("ORD", "2026-07-03")).toBeNull();
    // The strict timeout, not the upstream, decides when we give up.
    expect(Date.now() - started).toBeLessThan(5000);
    expect(holidayStats.timeouts - before).toBe(1);
  }, 10000);

  it("falls back to null on a non-2xx response and does not cache it", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("nope", { status: 503 });
    }) as typeof fetch;

    expect(await holidayFor("ORD", "2026-07-03")).toBeNull();
    expect(await holidayFor("ORD", "2026-07-03")).toBeNull();
    expect(calls).toBe(2); // a failure is retried, never cached
  });

  it("falls back to null when the body is not a holiday array", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "boom" }), { status: 200 })) as typeof fetch;
    expect(await holidayFor("ORD", "2026-07-03")).toBeNull();
  });

  it("falls back to null when fetch throws outright", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await holidayFor("ORD", "2026-07-03")).toBeNull();
  });

  it("skips the request entirely for an airport with no timezone", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(JULY4), { status: 200 });
    }) as typeof fetch;

    expect(await holidayFor("XXX", "2026-07-03")).toBeNull();
    expect(calls).toBe(0);
  });

  it("ignores a holiday more than five days from the travel date", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(JULY4), { status: 200 })) as typeof fetch;
    expect(await holidayFor("ORD", "2026-07-20")).toBeNull();
  });
});
