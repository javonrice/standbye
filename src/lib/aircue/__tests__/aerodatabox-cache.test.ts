/**
 * AeroDataBox cache: watch force must bypass a fresh 24h resolve cache.
 */
import { afterAll, afterEach, describe, expect, it } from "bun:test";

import { mockModuleIsolated } from "./mock-module-isolated";

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
let apiCalls = 0;
let upsertedKey = "";

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
                if (key.endsWith(":watch")) return Promise.resolve({ data: null });
                return Promise.resolve({
                  data: {
                    payload: [{ number: "UA782", status: "Scheduled" }],
                    expires_at: FUTURE,
                  },
                });
              },
            }),
          }),
          upsert: (row: { cache_key: string }) => {
            upsertedKey = row.cache_key;
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
});

describe("fetchFlightLegs cache bypass", () => {
  it("serves fresh resolve cache without calling the API when force is false", async () => {
    globalThis.fetch = () => {
      apiCalls += 1;
      return Promise.reject(new Error("API should not be called"));
    };

    const { fetchFlightLegs } = await import("@/lib/aircue/aerodatabox.server");
    const result = await fetchFlightLegs("UA782", "2026-08-29", { force: false });

    expect(apiCalls).toBe(0);
    expect(result.flights[0]?.status).toBe("Scheduled");
    expect(result.budgetBlocked).toBe(false);
  });

  it("calls the API and stores under the watch cache key when force is true", async () => {
    globalThis.fetch = async () => {
      apiCalls += 1;
      return new Response(JSON.stringify([{ number: "UA782", status: "Cancelled" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const { fetchFlightLegs } = await import("@/lib/aircue/aerodatabox.server");
    const result = await fetchFlightLegs("UA782", "2026-08-29", { force: true });

    expect(apiCalls).toBe(1);
    expect(result.flights[0]?.status).toBe("Cancelled");
    expect(upsertedKey).toBe("adb:status:UA782:2026-08-29:watch");
  });
});
