/**
 * Persist and read flight-level load snapshots (shared network).
 * Server-only.
 */
import {
  airlineFromSegmentKey,
  canContributeSharedSnapshot,
  normalizeAirlineCode,
} from "@/lib/aircue/load-screenshot/contribute-auth";
import { resolveAirlineVisibility, visibilityAllowsReuse } from "@/lib/aircue/load-screenshot/policy";
import type { TimestampSource } from "@/lib/aircue/load-screenshot/types";
import type { ReportedLoad } from "@/lib/aircue/standby";

type Row = Record<string, unknown>;

function db(client: unknown) {
  return client as {
    from: (table: string) => {
      select: (cols?: string) => unknown;
      insert: (row: Record<string, unknown>) => unknown;
      update: (row: Record<string, unknown>) => unknown;
      eq: (c: string, v: unknown) => unknown;
      in: (c: string, v: unknown[]) => unknown;
      order: (c: string, o?: { ascending?: boolean }) => unknown;
      maybeSingle: () => Promise<{ data: unknown; error?: { message: string } | null }>;
      single: () => Promise<{ data: unknown; error?: { message: string } | null }>;
    };
  };
}

function chain(q: unknown): {
  select: (c?: string) => ReturnType<typeof chain>;
  insert: (r: Record<string, unknown>) => ReturnType<typeof chain>;
  update: (r: Record<string, unknown>) => ReturnType<typeof chain>;
  eq: (c: string, v: unknown) => ReturnType<typeof chain>;
  in: (c: string, v: unknown[]) => ReturnType<typeof chain>;
  is: (c: string, v: unknown) => ReturnType<typeof chain>;
  order: (c: string, o?: { ascending?: boolean }) => ReturnType<typeof chain>;
  limit: (n: number) => ReturnType<typeof chain>;
  maybeSingle: () => Promise<{ data: unknown; error?: { message: string } | null }>;
  single: () => Promise<{ data: unknown; error?: { message: string } | null }>;
} {
  return q as ReturnType<typeof chain>;
}

async function runQuery<T = { data: unknown; error?: { message: string } | null }>(
  q: unknown,
): Promise<T> {
  return q as Promise<T>;
}

export interface SnapshotWriteInput {
  segmentKey: string;
  airline: string;
  flightNumber?: string | null;
  origin?: string | null;
  dest?: string | null;
  travelDate: string;
  schedDepUtc?: string | null;
  cabin: string;
  openSeats: number | null;
  standbys: number | null;
  observedAt: string;
  timestampSource: TimestampSource;
  timestampConfidence?: number | null;
  contributorUserId: string;
  /** Declared home airline — contribution auth (must match airline). */
  contributorHomeAirline: string;
  sourceKind: "screenshot" | "manual" | "import";
  parserProvider?: string | null;
  parserModel?: string | null;
  parserConfidence?: number | null;
  matchConfidence: number;
  parseJobId?: string | null;
  contentHash?: string | null;
}

export async function upsertSharedLoadSnapshot(
  client: unknown,
  input: SnapshotWriteInput,
): Promise<{ snapshotId: string | null; skippedReason?: string }> {
  const airline = normalizeAirlineCode(input.airline);
  if (!airline) return { snapshotId: null, skippedReason: "airline_unknown" };

  if (
    !canContributeSharedSnapshot({
      contributorHomeAirline: input.contributorHomeAirline,
      extractedAirline: airline,
    })
  ) {
    return { snapshotId: null, skippedReason: "home_airline_mismatch" };
  }

  const visibility = await resolveAirlineVisibility(client as never, airline);
  // private / restricted: personal reported_loads only — do not mint shared row
  if (visibility === "restricted") {
    return { snapshotId: null, skippedReason: "policy_restricted" };
  }
  if (visibility === "private") {
    return { snapshotId: null, skippedReason: "policy_private" };
  }
  if (visibility === "aggregate_only") {
    return { snapshotId: null, skippedReason: "aggregate_only_not_implemented" };
  }
  if (!visibilityAllowsReuse(visibility)) {
    return { snapshotId: null, skippedReason: `policy_${visibility}` };
  }

  // Supersede prior active snapshots for this segment
  const prior = await runQuery<{ data?: Row[] }>(
    chain(db(client).from("load_snapshots"))
      .select("id")
      .eq("segment_key", input.segmentKey)
      .eq("status", "active")
      .order("observed_at", { ascending: false }),
  );

  const priorRows = (prior.data ?? []) as Row[];

  const { data: inserted, error } = await runQuery<{
    data: unknown;
    error?: { message: string } | null;
  }>(
    chain(db(client).from("load_snapshots"))
      .insert({
        segment_key: input.segmentKey,
        airline,
        flight_number: input.flightNumber ?? null,
        origin: input.origin ?? null,
        dest: input.dest ?? null,
        travel_date: input.travelDate,
        sched_dep_utc: input.schedDepUtc ?? null,
        cabin: input.cabin,
        open_seats: input.openSeats,
        standbys: input.standbys,
        observed_at: input.observedAt,
        timestamp_source: input.timestampSource,
        timestamp_confidence: input.timestampConfidence ?? null,
        contributor_user_id: input.contributorUserId,
        source_kind: input.sourceKind,
        parser_provider: input.parserProvider ?? null,
        parser_model: input.parserModel ?? null,
        parser_confidence: input.parserConfidence ?? null,
        match_confidence: input.matchConfidence,
        visibility: "eligible_reuse",
        content_hash: input.contentHash ?? null,
        parse_job_id: input.parseJobId ?? null,
        status: "active",
      })
      .select("id")
      .single(),
  );

  if (error || !inserted) {
    console.error("[upsertSharedLoadSnapshot]", error?.message);
    return { snapshotId: null, skippedReason: "insert_failed" };
  }

  const snapshotId = String((inserted as Row)["id"]);
  for (const row of priorRows) {
    const id = String(row["id"] ?? "");
    if (!id || id === snapshotId) continue;
    await runQuery(
      chain(db(client).from("load_snapshots"))
        .update({ status: "superseded", superseded_by: snapshotId })
        .eq("id", id),
    );
  }

  return { snapshotId };
}

/**
 * Latest eligible reusable snapshot per segment → synthetic ReportedLoad for scoring.
 * partyIncluded defaults to "no" (count consumer party); never copies contributor party.
 */
export async function networkLoadsForSegments(
  client: unknown,
  segmentKeys: string[],
  travelDate: string,
): Promise<Map<string, ReportedLoad>> {
  const map = new Map<string, ReportedLoad>();
  if (segmentKeys.length === 0) return map;

  const { data } = await runQuery<{ data?: Row[] }>(
    chain(db(client).from("load_snapshots"))
      .select("*")
      .in("segment_key", segmentKeys)
      .eq("status", "active")
      .eq("visibility", "eligible_reuse")
      .eq("travel_date", travelDate)
      .order("observed_at", { ascending: false }),
  );

  for (const raw of ((data ?? []) as Row[])) {
    const key = String(raw["segment_key"] ?? "");
    if (!key || map.has(key)) continue;
    const airline = normalizeAirlineCode(String(raw["airline"] ?? "")) ?? airlineFromSegmentKey(key);
    const policy = await resolveAirlineVisibility(client as never, airline);
    if (!visibilityAllowsReuse(policy)) continue;

    map.set(key, {
      id: String(raw["id"]),
      segmentKey: key,
      flightLabel: `${String(raw["airline"] ?? "")}${String(raw["flight_number"] ?? "")}`.trim() || key,
      openSeats: raw["open_seats"] === null || raw["open_seats"] === undefined ? null : Number(raw["open_seats"]),
      standbys: raw["standbys"] === null || raw["standbys"] === undefined ? null : Number(raw["standbys"]),
      cabin: String(raw["cabin"] ?? "economy"),
      source: "network_snapshot",
      partyIncluded: "no",
      checkedAt: String(raw["observed_at"] ?? raw["captured_at"] ?? new Date().toISOString()),
    });
  }
  return map;
}

/** Prefer personal reported load; fill gaps from network. */
export function mergePersonalAndNetworkLoads(
  personal: Map<string, ReportedLoad>,
  network: Map<string, ReportedLoad>,
): Map<string, ReportedLoad> {
  const out = new Map<string, ReportedLoad>(personal);
  for (const [key, net] of network) {
    if (!out.has(key)) out.set(key, net);
  }
  return out;
}
