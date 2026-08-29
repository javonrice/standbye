/**
 * AeroDataBox cache: Watch scope uses :watch key; force only bypasses fresh TTL.
 */
import { afterAll, afterEach, describe, expect, it } from "bun:test";

import { mockModuleIsolated } from "./mock-module-isolated";

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
let apiCalls = 0;
let upsertedKey = "";
const cacheStore = new Map<string, { payload: unknown; expires_at: string }>();

const prevAdbKey = process.env["AERODATABOX_RAPIDAPI_KEY"];
const prevAdbEnabled = process.env["AERODATABOX_ENABLED"];

await mockModuleIsolated("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "source_cache") {
        return {
          select: () => ({
            eq: (_col: string, key: string) => ({
              maybeSingle: () => {
                const hit = cacheStore.get(key);
                if (hit) return Promise.resolve({ data: hit });
                return Promise.resolve({ data: null });
              },
            }),
          }),
          upsert: (row: { cache_key: string; payload: unknown; expires_at: string }) => {
            upsertedKey = row.cache_key;
            cacheStore.set(row.cache_key, {
              payload: row.payload,
              expires_at: row.expires_at,
            });
            return Promise.resolve({ data: null });
          },
        };
      }
      if (table === "api_usage_log") {
        return { insert: () => Promise.resolve({ data: null }) };
      }
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 0 }),
          }),
        }),
      };
    },
    rpc: () => Promise.resolve({ data: 0, error: null }),
  },
}));

process.env["AERODATABOX_RAPIDAPI_KEY"] = "test-key";
process.env["AERODATABOX_ENABLED"] = "true";

afterAll(() => {
  if (prevAdbKey === undefined) delete process.env["AERODATABOX_RAPIDAPI_KEY"];
  else process.env["AERODATABOX_RAPIDAPI_KEY"] = prevAdbKey;
  if (prevAdbEnabled === undefined) delete process.env["AERODATABOX_ENABLED"];
  else process.env["AERODATABOX_ENABLED"] = prevAdbEnabled;
});

afterEach(() => {
  apiCalls = 0;
  upsertedKey = "";
  cacheStore.clear();
});

describe("fetchFlightLegs cache scopes", () => {
  it("serves fresh resolve cache without calling the API when force is false", async () => {
    cacheStore.set("adb:status:UA782:2026-08-29", {
      payload: [{ number: "UA782", status: "Scheduled" }],
      expires_at: FUTURE,
    });

    globalThis.fetch = () => {
      apiCalls += 1;
      return Promise.reject(new Error("API should not be called"));
    };

    const { fetchFlightLegs } = await import("@/lib/aircue/aerodatabox.server");
    const result = await fetchFlightLegs("UA782", "2026-08-29", { force: false, watch: false });

    expect(apiCalls).toBe(0);
    expect(result.flights[0]?.status).toBe("Scheduled");
    expect(result.fromCache).toBe(true);
    expect(result.budgetBlocked).toBe(false);
  });

  it("reuses fresh watch cache without force", async () => {
    cacheStore.set("adb:status:UA782:2026-08-29:watch", {
      payload: [{ number: "UA782", status: "Scheduled" }],
      expires_at: FUTURE,
    });

    globalThis.fetch = () => {
      apiCalls += 1;
      return Promise.reject(new Error("API should not be called"));
    };

    const { fetchFlightLegs } = await import("@/lib/aircue/aerodatabox.server");
    const result = await fetchFlightLegs("UA782", "2026-08-29", { watch: true, force: false });

    expect(apiCalls).toBe(0);
    expect(result.fromCache).toBe(true);
    expect(result.flights[0]?.status).toBe("Scheduled");
  });

  it("calls the API and stores under the watch cache key when force is true", async () => {
    cacheStore.set("adb:status:UA782:2026-08-29:watch", {
      payload: [{ number: "UA782", status: "Scheduled" }],
      expires_at: FUTURE,
    });

    globalThis.fetch = async () => {
      apiCalls += 1;
      return new Response(JSON.stringify([{ number: "UA782", status: "Cancelled" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const { fetchFlightLegs } = await import("@/lib/aircue/aerodatabox.server");
    const result = await fetchFlightLegs("UA782", "2026-08-29", { watch: true, force: true });

    expect(apiCalls).toBe(1);
    expect(result.flights[0]?.status).toBe("Cancelled");
    expect(upsertedKey).toBe("adb:status:UA782:2026-08-29:watch");
  });
});

describe("fetchDepartureBoard FIDS keys", () => {
  it("keys by exact airport/date/window", async () => {
    globalThis.fetch = async () => {
      apiCalls += 1;
      return new Response(JSON.stringify({ departures: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const { fetchDepartureBoard } = await import("@/lib/aircue/aerodatabox.server");
    await fetchDepartureBoard("ORD", "2026-08-29", "2026-08-29T00:00", "2026-08-29T11:59");
    expect(upsertedKey).toBe("adb:fids:v2:ORD:2026-08-29:00:00-11:59");

    apiCalls = 0;
    await fetchDepartureBoard("ORD", "2026-08-29", "2026-08-29T00:00", "2026-08-29T11:59");
    expect(apiCalls).toBe(0);
  });

  it("does not collide different windows", async () => {
    globalThis.fetch = async () => {
      apiCalls += 1;
      return new Response(JSON.stringify({ departures: [{ number: "UA1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const { fetchDepartureBoard } = await import("@/lib/aircue/aerodatabox.server");
    await fetchDepartureBoard("ORD", "2026-08-29", "2026-08-29T00:00", "2026-08-29T11:59");
    const morningKey = upsertedKey;
    await fetchDepartureBoard("ORD", "2026-08-29", "2026-08-29T12:00", "2026-08-29T23:59");
    expect(morningKey).toBe("adb:fids:v2:ORD:2026-08-29:00:00-11:59");
    expect(upsertedKey).toBe("adb:fids:v2:ORD:2026-08-29:12:00-23:59");
    expect(apiCalls).toBe(2);
  });
});
