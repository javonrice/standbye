/**
 * Airport metadata batching: one shared cache behind geo, timezone and the
 * holiday lookup. These assert the batched path returns what the per-code
 * queries returned, and that a missing code still behaves as before.
 */
import { afterEach, describe, expect, it, mock } from "bun:test";

const ROWS = [
  { iata: "DEN", icao: "KDEN", lat: 39.86, lon: -104.67, city: "Denver", state: "CO", tz: "America/Denver" },
  { iata: "HNL", icao: "PHNL", lat: 21.32, lon: -157.92, city: "Honolulu", state: "HI", tz: "Pacific/Honolulu" },
  { iata: "NUL", icao: null, lat: 1, lon: 2, city: null, state: null, tz: null },
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

const { airportGeo, airportMeta, airportTimezone, airportLookupStats } = await import(
  "@/lib/aircue/airport-lookup.server"
);

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
    expect(selects[0]).toBe("iata,icao,lat,lon,city,state,tz");
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
