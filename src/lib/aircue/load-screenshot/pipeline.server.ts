/**
 * Screenshot + multi-row manual load pipeline.
 * Images stay in memory only for the duration of parseScreenshot.
 */
import { createHash } from "node:crypto";

import {
  airlineFromSegmentKey,
  canContributeSharedSnapshot,
  normalizeAirlineCode,
} from "@/lib/aircue/load-screenshot/contribute-auth";
import { interpretUnitedFlights } from "@/lib/aircue/load-screenshot/interpret/united";
import {
  getLoadScreenshotParser,
  isLoadScreenshotParsingConfigured,
} from "@/lib/aircue/load-screenshot/index";
import {
  candidatesFromSegments,
  matchExtractedToSegments,
} from "@/lib/aircue/load-screenshot/match";
import { resolveObservedAt } from "@/lib/aircue/load-screenshot/observed-at";
import { upsertSharedLoadSnapshot } from "@/lib/aircue/load-screenshot/snapshots.server";
import type { ExtractedFlightLoad, TimestampSource } from "@/lib/aircue/load-screenshot/types";
import { buildSegmentKey, type OptionKeySegment } from "@/lib/aircue/option-key";
import { segmentsFromRow } from "@/lib/aircue/plan-load-resort";

const MATCH_MIN = 0.7;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 4_500_000;

type Row = Record<string, unknown>;

function db(client: unknown) {
  return client as {
    from: (table: string) => unknown;
  };
}

function chain(q: unknown): {
  select: (c?: string) => ReturnType<typeof chain>;
  insert: (r: Record<string, unknown>) => ReturnType<typeof chain>;
  update: (r: Record<string, unknown>) => ReturnType<typeof chain>;
  eq: (c: string, v: unknown) => ReturnType<typeof chain>;
  in: (c: string, v: unknown[]) => ReturnType<typeof chain>;
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

export interface UncertainFlightRow {
  extracted: ExtractedFlightLoad;
  reason: "unmatched" | "ambiguous" | "low_confidence" | "rejected_airline";
  candidates: string[];
}

export interface AcceptedLoadRow {
  segmentKey: string;
  flightLabel: string;
  openSeats: number | null;
  standbys: number | null;
  cabin: string;
  snapshotId: string | null;
  shared: boolean;
}

export interface PipelineResult {
  planId: string;
  parseJobIds: string[];
  accepted: AcceptedLoadRow[];
  uncertain: UncertainFlightRow[];
  rejectedAirlineCount: number;
  askRecentConfirm: boolean;
  bestOptionChanged: boolean;
  previousPreferredId: string | null;
  newPreferredId: string | null;
  resortNotice: { headline: string; detail: string } | null;
  parsingConfigured: boolean;
  error?: string;
}

export interface ManualLoadRowInput {
  segmentKey: string;
  openSeats: number | null;
  standbys: number | null;
  cabin: string;
}

async function loadPlanContext(
  client: unknown,
  userId: string,
  planId: string,
): Promise<{
  travelDate: string;
  travelers: number;
  prefs: Record<string, unknown>;
  segments: OptionKeySegment[];
  optionRows: Row[];
} | null> {
  const { data: planRow } = await runQuery(
    chain(db(client).from("plans"))
      .select("id,travel_date,travelers,prefs,user_id")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (!planRow) return null;
  const plan = planRow as Row;

  const { data: optionRows } = await runQuery(
    chain(db(client).from("plan_options"))
      .select("*")
      .eq("plan_id", planId)
      .eq("is_current", true)
      .order("rank"),
  );

  const rows = (optionRows ?? []) as Row[];
  const segments: OptionKeySegment[] = [];
  for (const row of rows) {
    for (const segment of segmentsFromRow(row)) {
      segments.push(segment);
    }
  }

  return {
    travelDate: String(plan["travel_date"]),
    travelers: Number(plan["travelers"] ?? 1),
    prefs: (plan["prefs"] ?? {}) as Record<string, unknown>,
    segments,
    optionRows: rows,
  };
}

function flightLabelForSegment(segment: OptionKeySegment, segmentKey: string): string {
  if (segment.carrier && segment.flightNumber) {
    return `${segment.carrier}${segment.flightNumber}`;
  }
  return segmentKey.split(":")[0] || segmentKey;
}

async function insertPersonalLoad(
  client: unknown,
  input: {
    userId: string;
    segmentKey: string;
    flightLabel: string;
    travelDate: string;
    openSeats: number | null;
    standbys: number | null;
    cabin: string;
    source: string;
    partyIncluded: "yes" | "no" | "unsure" | null;
    snapshotId: string | null;
    checkedAt: string;
  },
): Promise<string | null> {
  const { data, error } = await runQuery<{
    data: unknown;
    error?: { message: string } | null;
  }>(
    chain(db(client).from("reported_loads"))
      .insert({
        user_id: input.userId,
        segment_key: input.segmentKey,
        flight_label: input.flightLabel,
        travel_date: input.travelDate,
        open_seats: input.openSeats,
        standbys: input.standbys,
        cabin: input.cabin,
        source: input.source,
        party_included: input.partyIncluded,
        checked_at: input.checkedAt,
        snapshot_id: input.snapshotId,
      })
      .select("id")
      .single(),
  );
  if (error) {
    console.error("[insertPersonalLoad]", error.message);
    return null;
  }
  return data ? String((data as Row)["id"]) : null;
}

async function maybeMintSnapshot(
  client: unknown,
  input: {
    contributorUserId: string;
    contributorHomeAirline: string;
    segmentKey: string;
    segment: OptionKeySegment | null;
    travelDate: string;
    cabin: string;
    openSeats: number | null;
    standbys: number | null;
    observedAt: string;
    timestampSource: TimestampSource;
    timestampConfidence?: number | null;
    sourceKind: "screenshot" | "manual";
    matchConfidence: number;
    parseJobId?: string | null;
    parserProvider?: string | null;
    parserModel?: string | null;
    parserConfidence?: number | null;
  },
): Promise<string | null> {
  const airline =
    normalizeAirlineCode(input.segment?.carrier) ??
    airlineFromSegmentKey(input.segmentKey) ??
    normalizeAirlineCode(input.contributorHomeAirline);
  if (
    !canContributeSharedSnapshot({
      contributorHomeAirline: input.contributorHomeAirline,
      extractedAirline: airline,
    })
  ) {
    return null;
  }
  if (input.matchConfidence < MATCH_MIN) return null;

  const { snapshotId } = await upsertSharedLoadSnapshot(client, {
    segmentKey: input.segmentKey,
    airline: airline!,
    flightNumber: input.segment?.flightNumber ?? null,
    origin: input.segment?.origin ?? null,
    dest: input.segment?.dest ?? null,
    travelDate: input.travelDate,
    schedDepUtc: input.segment?.schedDepUtc ?? null,
    cabin: input.cabin,
    openSeats: input.openSeats,
    standbys: input.standbys,
    observedAt: input.observedAt,
    timestampSource: input.timestampSource,
    timestampConfidence: input.timestampConfidence ?? null,
    contributorUserId: input.contributorUserId,
    contributorHomeAirline: input.contributorHomeAirline,
    sourceKind: input.sourceKind,
    parserProvider: input.parserProvider ?? null,
    parserModel: input.parserModel ?? null,
    parserConfidence: input.parserConfidence ?? null,
    matchConfidence: input.matchConfidence,
    parseJobId: input.parseJobId ?? null,
  });
  return snapshotId;
}

async function finalizeResort(
  client: unknown,
  userId: string,
  planId: string,
  prefs: Record<string, unknown>,
  optionRows: Row[],
  triggeringLabel: string,
): Promise<Pick<PipelineResult, "bestOptionChanged" | "previousPreferredId" | "newPreferredId" | "resortNotice">> {
  const { rescorePlanAfterLoads, buildLoadResortNoticeForPipeline } = await import(
    "@/lib/aircue/plan.server"
  );
  const resort = await rescorePlanAfterLoads(client, userId, planId);
  const resortNotice = buildLoadResortNoticeForPipeline(resort, optionRows, triggeringLabel);
  if (resortNotice) {
    await runQuery(
      chain(db(client).from("plans"))
        .update({
          prefs: {
            ...prefs,
            lastLoadResort: { ...resortNotice, at: new Date().toISOString() },
          },
        })
        .eq("id", planId)
        .eq("user_id", userId),
    );
  }
  return {
    bestOptionChanged: resort.bestOptionChanged,
    previousPreferredId: resort.previousPreferredId,
    newPreferredId: resort.newPreferredId,
    resortNotice,
  };
}

function decodeBase64Image(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
  return Uint8Array.from(Buffer.from(cleaned, "base64"));
}

/**
 * Process one or more screenshots sequentially for a plan.
 * Raw bytes are discarded after each parse returns.
 */
export async function processPlanScreenshotLoads(
  client: unknown,
  userId: string,
  input: {
    planId: string;
    images: Array<{
      mimeType: string;
      base64: string;
      fileLastModifiedMs?: number | null;
    }>;
    partyIncluded?: "yes" | "no" | "unsure" | null;
    /** When user confirmed a stale-looking timestamp. */
    confirmedObservedAt?: string | null;
  },
): Promise<PipelineResult> {
  const empty = (extra: Partial<PipelineResult> = {}): PipelineResult => ({
    planId: input.planId,
    parseJobIds: [],
    accepted: [],
    uncertain: [],
    rejectedAirlineCount: 0,
    askRecentConfirm: false,
    bestOptionChanged: false,
    previousPreferredId: null,
    newPreferredId: null,
    resortNotice: null,
    parsingConfigured: isLoadScreenshotParsingConfigured(),
    ...extra,
  });

  if (!isLoadScreenshotParsingConfigured()) {
    return empty({
      error:
        "Screenshot parsing is not configured. Set GEMINI_API_KEY (or LOAD_SCREENSHOT_PROVIDER=lovable with LOVABLE_VISION_URL + LOVABLE_VISION_API_KEY).",
    });
  }

  const ctx = await loadPlanContext(client, userId, input.planId);
  if (!ctx) return empty({ error: "That plan is no longer available." });

  const profile = await import("@/lib/aircue/plan.server").then((m) =>
    m.loadStandbyProfile(client, userId),
  );
  const homeAirline = normalizeAirlineCode(profile?.homeAirline ?? "");
  if (!homeAirline) {
    return empty({ error: "Set your home airline in your profile before uploading loads." });
  }

  const images = input.images.slice(0, MAX_IMAGES);
  if (images.length === 0) return empty({ error: "Add at least one screenshot." });

  const candidates = candidatesFromSegments(ctx.segments);
  const segmentByKey = new Map(
    ctx.segments.map((s) => [buildSegmentKey(s), s] as const),
  );

  const accepted: AcceptedLoadRow[] = [];
  const uncertain: UncertainFlightRow[] = [];
  const parseJobIds: string[] = [];
  let rejectedAirlineCount = 0;
  let askRecentConfirm = false;
  let triggeringLabel = "your loads";

  const parser = getLoadScreenshotParser();

  for (const image of images) {
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64Image(image.base64);
    } catch {
      uncertain.push({
        extracted: {},
        reason: "unmatched",
        candidates: [],
      });
      continue;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
      return empty({
        error: "Each screenshot must be under about 4 MB.",
        parseJobIds,
        accepted,
        uncertain,
        rejectedAirlineCount,
      });
    }

    const imageSha = createHash("sha256").update(bytes).digest("hex");

    // Reuse a recent successful extraction for the same image hash (skip paid vision).
    const recent = await runQuery<{ data?: Row[] }>(
      chain(db(client).from("load_parse_jobs"))
        .select("id,raw_meta,status,provider,model")
        .eq("user_id", userId)
        .eq("image_sha256", imageSha)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1),
    );

    const recentRow = ((recent.data ?? [])[0] ?? null) as Row | null;

    let flights: ExtractedFlightLoad[] = [];
    let provider = parser.providerId;
    let model = "unknown";
    let confidence = 0.7;
    let usage: { units?: number; costUsdEstimate?: number; requestId?: string } | undefined;
    let observedGuess: {
      at: string;
      source: "screenshot" | "metadata";
      confidence: number;
    } | undefined;

    const { data: jobInserted } = await runQuery(
      chain(db(client).from("load_parse_jobs"))
        .insert({
          user_id: userId,
          provider: parser.providerId,
          model: null,
          status: "running",
          image_sha256: imageSha,
          contributor_home_airline: homeAirline,
          airline_hint: homeAirline,
        })
        .select("id")
        .single(),
    );

    const parseJobId = jobInserted ? String((jobInserted as Row)["id"]) : null;
    if (parseJobId) parseJobIds.push(parseJobId);

    try {
      if (recentRow && recentRow["raw_meta"]) {
        const meta = recentRow["raw_meta"] as { flights?: ExtractedFlightLoad[] };
        flights = Array.isArray(meta.flights) ? meta.flights : [];
        provider = String(recentRow["provider"] ?? provider);
        model = String(recentRow["model"] ?? "cached");
        confidence = 0.85;
      } else {
        const parsed = await parser.parseScreenshot({
          imageBytes: bytes,
          mimeType: image.mimeType || "image/jpeg",
          airlineHint: homeAirline,
        });
        flights = parsed.flights;
        provider = parsed.provider;
        model = parsed.model;
        confidence = parsed.confidence;
        usage = parsed.usage;
        observedGuess = parsed.observedAtGuess;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse failed";
      if (parseJobId) {
        await runQuery(
          chain(db(client).from("load_parse_jobs"))
            .update({ status: "failed", error: message.slice(0, 500) })
            .eq("id", parseJobId),
        );
      }
      // Drop bytes reference
      bytes = new Uint8Array();
      return empty({
        error: message,
        parseJobIds,
        accepted,
        uncertain,
        rejectedAirlineCount,
      });
    }

    // Discard image bytes immediately after parse
    bytes = new Uint8Array();

    const interpreted =
      homeAirline === "UA" ? interpretUnitedFlights(flights) : flights;

    const observed = input.confirmedObservedAt
      ? {
          observedAt: input.confirmedObservedAt,
          timestampSource: "user_confirmed" as const,
          timestampConfidence: 0.9,
          askRecentConfirm: false,
        }
      : resolveObservedAt({
          parse: observedGuess ? { observedAtGuess: observedGuess } : null,
          fileLastModifiedMs: image.fileLastModifiedMs ?? null,
        });
    if (observed.askRecentConfirm) askRecentConfirm = true;

    // Persist parse result for hash reuse, but do not attach loads until user confirms.
    if (observed.askRecentConfirm && !input.confirmedObservedAt) {
      if (parseJobId) {
        await runQuery(
          chain(db(client).from("load_parse_jobs"))
            .update({
              status: "succeeded",
              provider,
              model,
              flight_count_extracted: interpreted.length,
              flight_count_accepted: 0,
              flight_count_rejected_airline: 0,
              cost_units: usage?.units ?? null,
              cost_usd_estimate: usage?.costUsdEstimate ?? null,
              provider_request_id: usage?.requestId ?? null,
              raw_meta: { flights: interpreted, pendingConfirm: true },
            })
            .eq("id", parseJobId),
        );
      }
      return {
        planId: input.planId,
        parseJobIds,
        accepted,
        uncertain,
        rejectedAirlineCount,
        askRecentConfirm: true,
        bestOptionChanged: false,
        previousPreferredId: null,
        newPreferredId: null,
        resortNotice: null,
        parsingConfigured: true,
      };
    }

    let acceptedThis = 0;
    let extractedCount = interpreted.length;

    for (const row of interpreted) {
      const extractedAirline = normalizeAirlineCode(row.airline) ?? homeAirline;
      if (
        !canContributeSharedSnapshot({
          contributorHomeAirline: homeAirline,
          extractedAirline,
        })
      ) {
        rejectedAirlineCount += 1;
        uncertain.push({ extracted: row, reason: "rejected_airline", candidates: [] });
        continue;
      }

      const match = matchExtractedToSegments(row, candidates);
      if (match.status === "unmatched") {
        uncertain.push({ extracted: row, reason: "unmatched", candidates: [] });
        continue;
      }
      if (match.status === "ambiguous") {
        uncertain.push({
          extracted: row,
          reason: "ambiguous",
          candidates: match.candidates,
        });
        continue;
      }
      if ((match.matchConfidence ?? 0) < MATCH_MIN) {
        uncertain.push({
          extracted: row,
          reason: "low_confidence",
          candidates: match.candidates,
        });
        continue;
      }

      const segmentKey = match.segmentKey!;
      const segment = segmentByKey.get(segmentKey) ?? null;
      const cabin = row.cabin ?? "economy";
      const openSeats = row.openSeats ?? null;
      const standbys = row.standbys ?? null;
      const label = segment
        ? flightLabelForSegment(segment, segmentKey)
        : `${extractedAirline}${row.flightNumber ?? ""}`;

      const snapshotId = await maybeMintSnapshot(client, {
        contributorUserId: userId,
        contributorHomeAirline: homeAirline,
        segmentKey,
        segment,
        travelDate: ctx.travelDate,
        cabin,
        openSeats,
        standbys,
        observedAt: observed.observedAt,
        timestampSource: observed.timestampSource,
        timestampConfidence: observed.timestampConfidence,
        sourceKind: "screenshot",
        matchConfidence: match.matchConfidence,
        parseJobId,
        parserProvider: provider,
        parserModel: model,
        parserConfidence: confidence,
      });

      await insertPersonalLoad(client, {
        userId,
        segmentKey,
        flightLabel: label,
        travelDate: ctx.travelDate,
        openSeats,
        standbys,
        cabin,
        source: "screenshot",
        partyIncluded: input.partyIncluded ?? null,
        snapshotId,
        checkedAt: observed.observedAt,
      });

      accepted.push({
        segmentKey,
        flightLabel: label,
        openSeats,
        standbys,
        cabin,
        snapshotId,
        shared: Boolean(snapshotId),
      });
      acceptedThis += 1;
      triggeringLabel = label;
    }

    if (parseJobId) {
      await runQuery(
        chain(db(client).from("load_parse_jobs"))
          .update({
            status: acceptedThis > 0 ? (uncertain.length > 0 ? "partial" : "succeeded") : "partial",
            provider,
            model,
            flight_count_extracted: extractedCount,
            flight_count_accepted: acceptedThis,
            flight_count_rejected_airline: rejectedAirlineCount,
            cost_units: usage?.units ?? null,
            cost_usd_estimate: usage?.costUsdEstimate ?? null,
            provider_request_id: usage?.requestId ?? null,
            raw_meta: { flights: interpreted },
          })
          .eq("id", parseJobId),
      );
    }
  }

  if (accepted.length === 0) {
    return {
      planId: input.planId,
      parseJobIds,
      accepted,
      uncertain,
      rejectedAirlineCount,
      askRecentConfirm,
      bestOptionChanged: false,
      previousPreferredId: null,
      newPreferredId: null,
      resortNotice: null,
      parsingConfigured: true,
    };
  }

  const resort = await finalizeResort(
    client,
    userId,
    input.planId,
    ctx.prefs,
    ctx.optionRows,
    triggeringLabel,
  );

  return {
    planId: input.planId,
    parseJobIds,
    accepted,
    uncertain,
    rejectedAirlineCount,
    askRecentConfirm,
    ...resort,
    parsingConfigured: true,
  };
}

/**
 * Plan-level multi-row manual loads. Shared snapshots only when home airline matches.
 */
export async function attachManualLoadsForPlan(
  client: unknown,
  userId: string,
  input: {
    planId: string;
    rows: ManualLoadRowInput[];
    partyIncluded: "yes" | "no" | "unsure" | null;
    source?: string;
  },
): Promise<PipelineResult> {
  const empty = (extra: Partial<PipelineResult> = {}): PipelineResult => ({
    planId: input.planId,
    parseJobIds: [],
    accepted: [],
    uncertain: [],
    rejectedAirlineCount: 0,
    askRecentConfirm: false,
    bestOptionChanged: false,
    previousPreferredId: null,
    newPreferredId: null,
    resortNotice: null,
    parsingConfigured: isLoadScreenshotParsingConfigured(),
    ...extra,
  });

  const ctx = await loadPlanContext(client, userId, input.planId);
  if (!ctx) return empty({ error: "That plan is no longer available." });

  const profile = await import("@/lib/aircue/plan.server").then((m) =>
    m.loadStandbyProfile(client, userId),
  );
  const homeAirline = normalizeAirlineCode(profile?.homeAirline ?? "");

  const segmentByKey = new Map(
    ctx.segments.map((s) => [buildSegmentKey(s), s] as const),
  );
  const validKeys = new Set(segmentByKey.keys());

  const accepted: AcceptedLoadRow[] = [];
  const uncertain: UncertainFlightRow[] = [];
  let rejectedAirlineCount = 0;
  let triggeringLabel = "your loads";
  const nowIso = new Date().toISOString();

  for (const row of input.rows) {
    const segmentKey = row.segmentKey.trim();
    if (!validKeys.has(segmentKey)) {
      uncertain.push({
        extracted: { flightNumber: segmentKey },
        reason: "unmatched",
        candidates: [...validKeys].slice(0, 8),
      });
      continue;
    }
    const segment = segmentByKey.get(segmentKey)!;
    const airline = normalizeAirlineCode(segment.carrier);
    const label = flightLabelForSegment(segment, segmentKey);
    const cabin = row.cabin || "economy";

    let snapshotId: string | null = null;
    if (
      homeAirline &&
      canContributeSharedSnapshot({
        contributorHomeAirline: homeAirline,
        extractedAirline: airline,
      })
    ) {
      snapshotId = await maybeMintSnapshot(client, {
        contributorUserId: userId,
        contributorHomeAirline: homeAirline,
        segmentKey,
        segment,
        travelDate: ctx.travelDate,
        cabin,
        openSeats: row.openSeats,
        standbys: row.standbys,
        observedAt: nowIso,
        timestampSource: "inferred_upload",
        timestampConfidence: 0.5,
        sourceKind: "manual",
        matchConfidence: 1,
      });
    } else if (airline && homeAirline && airline !== homeAirline) {
      rejectedAirlineCount += 1;
      // Still allow personal reported_loads for own plan
    }

    await insertPersonalLoad(client, {
      userId,
      segmentKey,
      flightLabel: label,
      travelDate: ctx.travelDate,
      openSeats: row.openSeats,
      standbys: row.standbys,
      cabin,
      source: input.source ?? "employee_system",
      partyIncluded: input.partyIncluded,
      snapshotId,
      checkedAt: nowIso,
    });

    accepted.push({
      segmentKey,
      flightLabel: label,
      openSeats: row.openSeats,
      standbys: row.standbys,
      cabin,
      snapshotId,
      shared: Boolean(snapshotId),
    });
    triggeringLabel = label;
  }

  if (accepted.length === 0) {
    return empty({ accepted, uncertain, rejectedAirlineCount });
  }

  const resort = await finalizeResort(
    client,
    userId,
    input.planId,
    ctx.prefs,
    ctx.optionRows,
    triggeringLabel,
  );

  return {
    planId: input.planId,
    parseJobIds: [],
    accepted,
    uncertain,
    rejectedAirlineCount,
    askRecentConfirm: false,
    ...resort,
    parsingConfigured: isLoadScreenshotParsingConfigured(),
  };
}
