/**
 * Airport metadata batching: one shared cache behind geo, timezone and the
 * holiday lookup. These assert the batched path returns what the per-code
 * queries returned, and that a missing code still behaves as before.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";

const ROWS = [
  {
    iata: "DEN",
    icao: "KDEN",
    lat: 39.86,
    lon: -104.67,
    city: "Denver",
    state: "CO",
    tz: "America/Denver",
    country: "US",
  },
  {
    iata: "HNL",
    icao: "PHNL",
    lat: 21.32,
    lon: -157.92,
    city: "Honolulu",
    state: "HI",
    tz: "Pacific/Honolulu",
    country: "US",
  },
  { iata: "NUL", icao: null, lat: 1, lon: 2, city: null, state: null, tz: null, country: null },
  // No stored ICAO: the prefix must be derived from state/timezone.
  {
    iata: "ANC",
    icao: null,
    lat: 61.17,
    lon: -150.0,
    city: "Anchorage",
    state: "AK",
    tz: "America/Anchorage",
    country: "US",
  },
  {
    iata: "ORD",
    icao: "  kord ",
    lat: 41.97,
    lon: -87.9,
    city: "Chicago",
    state: "IL",
    tz: "America/Chicago",
    country: "US",
  },
  {
    iata: "YYZ",
    icao: null,
    lat: 43.68,
    lon: -79.63,
    city: "Toronto",
    state: null,
    tz: "America/Toronto",
    country: "CA",
  },
];

let selects: string[] = [];
let inCalls: string[][] = [];

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return {
          in: (_col: string, codes: string[]) => {
            inCalls.push(codes);
            return Promise.resolve({ data: ROWS.filter((r) => codes.includes(r.iata)) });
          },
        };
      },
    }),
  },
}));

const { airportGeo, airportMeta, airportTimezone, icaoForAirport, airportLookupStats } =
  await import("@/lib/aircue/airport-lookup.server");

afterEach(() => {
  selects = [];
  inCalls = [];
});

describe("airport metadata cache", () => {
  it("serves geo, timezone and full metadata from one batched read", async () => {
    const before = airportLookupStats.metadataReads;

    const geo = await airportGeo(["DEN", "HNL"]);
    expect(geo.get("DEN")).toEqual({ lat: 39.86, lon: -104.67, city: "Denver" });
    expect(geo.get("HNL")).toEqual({ lat: 21.32, lon: -157.92, city: "Honolulu" });

    // Timezone and metadata for the same codes must not issue another read.
    expect(await airportTimezone("DEN")).toBe("America/Denver");
    expect(await airportTimezone("hnl")).toBe("Pacific/Honolulu");
    expect((await airportMeta("DEN"))?.state).toBe("CO");
    expect((await airportMeta("HNL"))?.icao).toBe("PHNL");

    expect(airportLookupStats.metadataReads - before).toBe(1);
    expect(inCalls).toEqual([["DEN", "HNL"]]);
    expect(selects[0]).toBe("iata,icao,lat,lon,city,state,tz,country");
  });

  it("omits an unknown code from geo and caches the miss", async () => {
    const before = airportLookupStats.metadataReads;

    const geo = await airportGeo(["ZZZ"]);
    expect(geo.has("ZZZ")).toBe(false);
    expect(await airportTimezone("ZZZ")).toBeNull();
    expect(await airportMeta("ZZZ")).toBeNull();

    // One read for the miss, then never queried again.
    expect(airportLookupStats.metadataReads - before).toBe(1);
  });

  it("keeps null metadata columns as null rather than inventing values", async () => {
    const meta = await airportMeta("NUL");
    expect(meta?.icao).toBeNull();
    expect(meta?.city).toBeNull();
    expect(meta?.state).toBeNull();
    expect(meta?.tz).toBeNull();
    expect(await airportTimezone("NUL")).toBeNull();
  });

  it("uppercases lookups so mixed-case codes hit the same cache entry", async () => {
    const before = airportLookupStats.metadataReads;
    await airportMeta("den");
    await airportGeo(["den"]);
    expect(airportLookupStats.metadataReads - before).toBe(0);
  });
});

describe("icaoForAirport over the shared cache", () => {
  it("prefers the stored ICAO, trimmed and uppercased", async () => {
    expect(await icaoForAirport("ORD")).toBe("KORD");
    expect(await icaoForAirport("DEN")).toBe("KDEN");
  });

  it("derives P/K prefixes from state and timezone when no ICAO is stored", async () => {
    expect(await icaoForAirport("ANC")).toBe("PANC");
  });

  it("returns null for an airport it cannot place, so callers skip the request", async () => {
    expect(await icaoForAirport("YYZ")).toBeNull();
    expect(await icaoForAirport("ZZZ")).toBeNull();
  });

  it("costs no query of its own once the airport is cached", async () => {
    await airportMeta("ORD");
    const before = airportLookupStats.metadataReads;
    await icaoForAirport("ORD");
    await icaoForAirport("ord");
    expect(airportLookupStats.metadataReads - before).toBe(0);
  });
});
