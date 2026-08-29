/**
 * Pass C airport persistence: O&D required; unresolved fails; connection hubs soft-drop.
 */
import { describe, expect, it } from "bun:test";

import {
  ensureCanonicalAirports,
  requireCanonicalAirports,
  UnresolvedAirportError,
} from "@/lib/aircue/airports-canonical.server";

function mockAirportsClient(present: string[]) {
  const set = new Set(present.map((c) => c.toUpperCase()));
  return {
    from: (table: string) => {
      if (table !== "airports") throw new Error(`unexpected ${table}`);
      return {
        select: () => ({
          in: (_col: string, codes: string[]) =>
            Promise.resolve({
              data: codes.filter((c) => set.has(c.toUpperCase())).map((iata) => ({ iata })),
              error: null,
            }),
        }),
      };
    },
  };
}

describe("canonical airport persistence", () => {
  it("requires O&D and fails unresolved IATA without inventing rows", async () => {
    const client = mockAirportsClient(["FRA", "SIN"]);
    await expect(requireCanonicalAirports(client, ["FRA", "SIN"])).resolves.toBeUndefined();
    let threw: unknown = null;
    try {
      await requireCanonicalAirports(client, ["FRA", "ZZZ"]);
    } catch (error) {
      threw = error;
    }
    expect(threw instanceof UnresolvedAirportError).toBe(true);
    expect((threw as UnresolvedAirportError).codes).toContain("ZZZ");
    expect((threw as UnresolvedAirportError).message).toBe(
      "We don't recognize ZZZ yet. Check the airport code and try again.",
    );
  });

  it("reports missing connection hubs so callers can skip those options", async () => {
    const client = mockAirportsClient(["ORD", "SGN"]);
    const result = await ensureCanonicalAirports(client, ["ORD", "HND", "SGN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["HND"]);
      expect(result.queryFailed).toBeUndefined();
    }
  });

  it("marks query failure so sync does not wipe options", async () => {
    const client = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        }),
      }),
    };
    const result = await ensureCanonicalAirports(client, ["FRA", "SIN"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.queryFailed).toBe(true);
  });
});
