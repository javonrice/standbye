/**
 * Multi-leg flight numbers must match on origin + destination, not just number.
 */
import { describe, expect, it } from "bun:test";

import { pickLeg, type AdbFlight } from "@/lib/aircue/aerodatabox.server";

const MULTI_LEG: AdbFlight[] = [
  {
    number: "UA1448",
    status: "Scheduled",
    departure: { airport: { iata: "RDU" } },
    arrival: { airport: { iata: "ORD" } },
  },
  {
    number: "UA1448",
    status: "Cancelled",
    departure: { airport: { iata: "ORD" } },
    arrival: { airport: { iata: "IAH" } },
  },
];

describe("pickLeg", () => {
  it("6. matches the watched leg when the same number operates twice", () => {
    expect(pickLeg(MULTI_LEG, "RDU", "ORD")?.status).toBe("Scheduled");
    expect(pickLeg(MULTI_LEG, "ORD", "IAH")?.status).toBe("Cancelled");
  });

  it("falls back to origin-only when destination is omitted", () => {
    expect(pickLeg(MULTI_LEG, "ORD")?.status).toBe("Cancelled");
  });
});
