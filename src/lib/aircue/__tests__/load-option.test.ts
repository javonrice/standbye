/**
 * Regression: Option Detail must load after plans.primary_option_id made the
 * plans ↔ plan_options embed ambiguous to PostgREST.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";

const USER_ID = "user-1";
const PLAN_ID = "plan-1";
const OPTION_ID = "11111111-1111-1111-1111-111111111111";
const MISSING_ID = "22222222-2222-2222-2222-222222222222";

let lastSelect: string | null = null;
let queryError: { message: string; code?: string; details?: string } | null = null;
let optionRow: Record<string, unknown> | null = null;
let watchRow: Record<string, unknown> | null = null;

mock.module("@/lib/aircue/plan.server", () => ({
  optionFromRow: (row: Record<string, unknown>) => ({
    id: String(row["id"]),
    planId: String(row["plan_id"]),
    rank: Number(row["rank"] ?? 1),
    kind: row["kind"] ?? "nonstop",
    judgment: row["label"] ?? "mixed",
    confidence: "medium",
    headline: String(row["headline"] ?? ""),
    flightLabel: String(row["flight_label"] ?? ""),
    optionKey: (row["option_key"] as string | null) ?? null,
    carrier: row["carrier"] ?? null,
    flightNumber: row["flight_number"] ?? null,
    origin: String(row["origin_iata"] ?? ""),
    dest: String(row["dest_iata"] ?? ""),
    depLocal: String(row["dep_local"] ?? ""),
    arrLocal: String(row["arr_local"] ?? ""),
    schedDepUtc: null,
    segments: (row["segments"] as unknown[]) ?? [],
    pillars: [],
    reasons: [],
    evidence: {
      availability: { checked: false, tested: [], largestShowing: null, checkedAt: null },
      conditions: null,
      history: null,
      holiday: null,
      recovery: {
        state: "unknown",
        label: "Unknown",
        summary: "",
        hoursRemaining: null,
        laterNonstops: [],
        alternates: [],
      },
    },
    load: null,
    refreshedAt: new Date().toISOString(),
  }),
  latestLoadFor: async () => null,
}));

function makeOptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: OPTION_ID,
    plan_id: PLAN_ID,
    user_id: USER_ID,
    rank: 1,
    kind: "nonstop",
    label: "favorable",
    headline: "UA782 looks workable",
    flight_label: "UA782",
    carrier: "UA",
    flight_number: "782",
    origin_iata: "ORD",
    dest_iata: "CMH",
    dep_local: "5:10 PM",
    arr_local: "7:20 PM",
    segments: [],
    plans: {
      travel_date: "2026-08-29",
      primary_option_id: OPTION_ID,
    },
    ...overrides,
  };
}

function createMockClient() {
  return {
    from: (table: string) => {
      if (table === "plan_options") {
        return {
          select: (cols: string) => {
            lastSelect = cols;
            return {
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: queryError ? null : optionRow,
                      error: queryError,
                    }),
                }),
              }),
            };
          },
        };
      }
      if (table === "watch_plans") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: watchRow, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const { loadOption } = await import("@/lib/aircue/option.server");

beforeEach(() => {
  lastSelect = null;
  queryError = null;
  optionRow = makeOptionRow();
  watchRow = { id: "watch-1" };
});

describe("loadOption after primary_option_id relationship", () => {
  it("disambiguates the parent plan via plan_options_plan_id_fkey", async () => {
    const result = await loadOption(createMockClient(), USER_ID, OPTION_ID);

    expect(lastSelect).toContain("plans!plan_options_plan_id_fkey");
    expect(lastSelect).toContain("travel_date");
    expect(lastSelect).toContain("primary_option_id");
    expect(result.option).not.toBeNull();
    expect(result.option?.id).toBe(OPTION_ID);
    expect(result.option?.flightLabel).toBe("UA782");
    expect(result.planId).toBe(PLAN_ID);
    expect(result.travelDate).toBe("2026-08-29");
    expect(result.isPrimary).toBe(true);
    expect(result.watchId).toBe("watch-1");
  });

  it("loads a connection option with the owning plan", async () => {
    optionRow = makeOptionRow({
      kind: "connection",
      flight_label: "UA400 → UA510",
      segments: [
        { origin: "ORD", dest: "DEN", carrier: "UA", flightNumber: "400" },
        { origin: "DEN", dest: "CMH", carrier: "UA", flightNumber: "510" },
      ],
      plans: { travel_date: "2026-08-29", primary_option_id: null },
    });

    const result = await loadOption(createMockClient(), USER_ID, OPTION_ID);

    expect(result.option?.kind).toBe("connection");
    expect(result.planId).toBe(PLAN_ID);
    expect(result.travelDate).toBe("2026-08-29");
    expect(result.isPrimary).toBe(false);
  });

  it("returns missing-option state when the query succeeds with no row", async () => {
    optionRow = null;
    const result = await loadOption(createMockClient(), USER_ID, MISSING_ID);

    expect(result.option).toBeNull();
    expect(result.planId).toBeNull();
    expect(result.travelDate).toBeNull();
    expect(result.isPrimary).toBe(false);
  });

  it("throws on PostgREST/database error instead of pretending the option is gone", async () => {
    queryError = {
      message: "Could not embed because more than one relationship was found for 'plan_options' and 'plans'",
      code: "PGRST201",
      details: "ambiguous",
    };
    optionRow = null;

    await expect(loadOption(createMockClient(), USER_ID, OPTION_ID)).rejects.toThrow(
      /Could not load this option right now/,
    );
  });
});
