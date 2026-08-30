import { beforeEach, describe, expect, it } from "bun:test";

import { buildSegmentKey } from "@/lib/aircue/option-key";

const USER_ID = "user-1";
const OPTION_ID = "11111111-1111-1111-1111-111111111111";

let insertCalled = false;

function makeOptionRow() {
  return {
    id: OPTION_ID,
    plan_id: "plan-1",
    user_id: USER_ID,
    flight_label: "UA123",
    option_key: "UA123:ORD-DEN:2026-09-01T10:00",
    segments: [
      {
        carrier: "UA",
        flightNumber: "123",
        flightLabel: "UA123",
        origin: "ORD",
        dest: "DEN",
        schedDepUtc: "2026-09-01T10:00:00Z",
        depLocal: "5:00 AM",
      },
    ],
    plans: { travel_date: "2026-09-01", travelers: 1, prefs: {} },
  };
}

function createMockClient() {
  return {
    from: (table: string) => {
      if (table === "plan_options") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: makeOptionRow(), error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "reported_loads") {
        return {
          insert: () => {
            insertCalled = true;
            throw new Error("reported_loads insert should not run");
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const { attachLoad } = await import("@/lib/aircue/plan.server");

beforeEach(() => {
  insertCalled = false;
});

describe("attachLoad segment key validation", () => {
  it("rejects an arbitrary segment key that does not belong to the option", async () => {
    await expect(
      attachLoad(createMockClient(), USER_ID, {
        optionId: OPTION_ID,
        segmentKey: "UA999:ORD-DEN:2026-09-01T10:00",
        openSeats: 8,
        standbys: 3,
        cabin: "economy",
        source: "employee_system",
        partyIncluded: "yes",
      }),
    ).rejects.toThrow(/does not match this option/);
    expect(insertCalled).toBe(false);
  });

  it("rejects a cross-option segment key before insert", async () => {
    const foreignKey = buildSegmentKey({
      carrier: "UA",
      flightNumber: "456",
      origin: "ORD",
      dest: "DEN",
      schedDepUtc: "2026-09-01T12:00:00Z",
    });

    await expect(
      attachLoad(createMockClient(), USER_ID, {
        optionId: OPTION_ID,
        segmentKey: foreignKey,
        openSeats: 8,
        standbys: 3,
        cabin: "economy",
        source: "employee_system",
        partyIncluded: "no",
      }),
    ).rejects.toThrow(/does not match this option/);
    expect(insertCalled).toBe(false);
  });
});
