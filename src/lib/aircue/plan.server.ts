/** Server-only persistence and orchestration for the standby decision engine. */
import type { SupabaseClient } from "@supabase/supabase-js";

import { rankStandbyOptions, type RankedOption, type RankReason } from "@/lib/aircue/ranking.server";
import {
  confidenceWithLoad,
  judgeWithLoad,
  loadPillar,
  readLoad,
  scoreWithLoad,
} from "@/lib/aircue/load-adjust";
import type {
  Confidence,
  GatewayOption,
  Judgment,
  RoutingMode,
  Pillar,
  Reason,
  ReportedLoad,
  StandbyOption,
  StandbyPlan,
} from "@/lib/aircue/standby";
import type {
  ChangeItem,
  PlanSummary,
  StandbyProfileValues,
  WatchSummary,
} from "@/lib/aircue/plan.functions";
import {
  cancellationEvent,
  classifyFlightStatus,
  shouldEmitCancellation,
  watchFlightIdentity,
  type WatchFlightState,
  type WatchSnapshot,
} from "@/lib/aircue/watch-flight-state.server";
import {
  buildPlanWatchSnapshot,
  computeBackupRunway,
  detectAnchorOptionEvents,
  detectPlanChangeEvents,
  spilloverFromOption,
} from "@/lib/aircue/plan-watch-events.server";
import { buildOptionKey } from "@/lib/aircue/option-key";
import {
  accessTypeForCarrier,
  effectiveStaffTravelCarriers,
  resolveTravelAccess,
  travelAccessSnapshot,
  type AirlineAccessMeta,
} from "@/lib/aircue/travel-access";
import { requireCanonicalAirports, UnresolvedAirportError, ensureCanonicalAirports } from "@/lib/aircue/airports-canonical.server";
import { matchExistingOptionRow } from "@/lib/aircue/sync-option-match";
import { verifyOperatorForFlight } from "@/lib/aircue/operator-verify.server";
import {
  decideWatchOutcome,
  gatherWatchSignals,
  logWatchCycle,
  stampOutcomeOnSignals,
  stampRankOnSignals,
  type WatchSignalState,
} from "@/lib/aircue/watch-signals.server";
import {
  deltaProviderUsage,
  snapshotProviderUsage,
} from "@/lib/aircue/provider-usage.server";

/** The generated Database type does not yet know the standby tables. */
type Db = SupabaseClient;
const db = (client: unknown) => client as Db;

function homeAirlineFromPrefs(prefs: Record<string, unknown>): string | null {
  const snap = prefs["travelAccessSnapshot"] as { homeAirline?: string | null } | undefined;
  return snap?.homeAirline ?? null;
}

function accessMetaFromPrefs(prefs: Record<string, unknown>): AirlineAccessMeta | undefined {
  return (
    (prefs["accessMetaSnapshot"] as AirlineAccessMeta | undefined) ??
    (prefs["travelAccessSnapshot"] as { meta?: AirlineAccessMeta } | undefined)?.meta
  );
}

function effectiveCarriersFromPrefs(prefs: Record<string, unknown>): string[] {
  const effective = prefs["effectiveCarriers"] as string[] | null | undefined;
  if (effective && effective.length > 0) return effective.map((c) => c.toUpperCase());
  const carriers = prefs["carriers"] as string[] | null | undefined;
  return (carriers ?? []).map((c) => c.toUpperCase());
}

/** Drop options whose segment airports are not yet canonical — never invent rows. */
async function retainCanonicalSegmentOptions(
  client: unknown,
  options: RankedOption[],
): Promise<RankedOption[]> {
  if (options.length === 0) return options;
  const codes = new Set<string>();
  for (const o of options) {
    for (const s of o.segments) {
      if (s.origin) codes.add(s.origin.toUpperCase());
      if (s.dest) codes.add(s.dest.toUpperCase());
    }
  }
  const ensured = await ensureCanonicalAirports(client, [...codes]);
  if (ensured.ok) return options;
  // Lookup unavailable — do not wipe an otherwise valid Plan/sync.
  if (ensured.queryFailed) return options;
  const missing = new Set(ensured.missing.map((c) => c.toUpperCase()));
  return options.filter((o) =>
    o.segments.every(
      (s) => !missing.has(s.origin.toUpperCase()) && !missing.has(s.dest.toUpperCase()),
    ),
  );
}

async function persistOperatorVerification(
  client: unknown,
  option: StandbyOption,
  result: Awaited<ReturnType<typeof verifyOperatorForFlight>>,
): Promise<StandbyOption> {
  const nextAccess = result.accessFromOperator ?? option.access ?? null;
  const evidence: StandbyOption["evidence"] = {
    ...option.evidence,
    access: nextAccess,
    staffEligibility: result.staffEligibility,
    operatorVerification: result.operatorVerification,
    commercialFare: option.commercialFare ?? option.evidence.commercialFare ?? null,
  };
  const clears = option.standbyClears ?? option.evidence.standbyClears;
  if (typeof clears === "number") evidence.standbyClears = clears;
  const segments = option.segments.map((s) => ({
    ...s,
    access: result.accessFromOperator ?? s.access ?? null,
  }));

  await db(client)
    .from("plan_options")
    .update({
      evidence,
      segments,
      confidence:
        result.staffEligibility === "eligible"
          ? option.confidence === "low"
            ? "medium"
            : option.confidence
          : result.staffEligibility === "ineligible"
            ? "low"
            : option.confidence,
    })
    .eq("id", option.id);

  return {
    ...option,
    access: nextAccess,
    staffEligibility: result.staffEligibility,
    operatorVerification: result.operatorVerification,
    evidence,
    segments,
  };
}

type Row = Record<string, unknown>;

/* -------------------------------- profile -------------------------------- */

export async function loadStandbyProfile(
  client: unknown,
  userId: string,
): Promise<StandbyProfileValues | null> {
  const { data } = await db(client)
    .from("standby_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Row;
  const homeRaw = row["home_airline"];
  // Missing home airline must NOT silently become United.
  const homeAirline =
    homeRaw == null || String(homeRaw).trim() === ""
      ? ""
      : String(homeRaw).trim().toUpperCase();
  return {
    homeAirline,
    travelerType: String(row["traveler_type"] ?? "employee"),
    airlineAccess: (row["airline_access"] as string[]) ?? [],
    homeAirports: (row["home_airports"] as string[]) ?? [],
    notifyMode: String(row["notify_mode"] ?? "meaningful"),
    onboarded: Boolean(row["onboarded_at"]),
    painPoint: (row["pain_point"] as string | null) ?? null,
    accessMode: (row["access_mode"] as string | null) ?? null,
    freeDayUsed: Boolean(row["free_day_used"]),
    notifyOptin: Boolean(row["notify_optin"]),
    coachSeen: Boolean(row["coach_seen"]),
    airlineAccessMeta: (row["airline_access_meta"] as AirlineAccessMeta | null) ?? {},
  };
}

export async function persistStandbyProfile(
  client: unknown,
  userId: string,
  values: StandbyProfileValues,
): Promise<StandbyProfileValues> {
  await db(client)
    .from("standby_profiles")
    .upsert({
      user_id: userId,
      home_airline: values.homeAirline,
      traveler_type: values.travelerType,
      airline_access: values.airlineAccess,
      home_airports: values.homeAirports,
      notify_mode: values.notifyMode,
      pain_point: values.painPoint ?? null,
      access_mode: values.accessMode ?? null,
      free_day_used: values.freeDayUsed ?? false,
      notify_optin: values.notifyOptin ?? false,
      coach_seen: values.coachSeen ?? false,
      airline_access_meta: values.airlineAccessMeta ?? {},
      onboarded_at: values.onboarded ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  return values;
}


/* --------------------------------- plans --------------------------------- */

function optionInsert(planId: string, userId: string, option: RankedOption) {
  const optionKey =
    option.optionKey ||
    buildOptionKey(
      option.segments.map((s) => ({
        carrier: s.carrier,
        flightNumber: s.flightNumber,
        origin: s.origin,
        dest: s.dest,
        schedDepUtc: s.schedDepUtc,
        depLocal: s.depLocal,
      })),
    );
  return {
    plan_id: planId,
    user_id: userId,
    rank: option.rank,
    kind: option.kind,
    label: option.judgment,
    confidence: option.confidence,
    score: option.score,
    carrier: option.carrier,
    flight_number: option.flightNumber,
    flight_label: option.flightLabel,
    option_key: optionKey,
    origin_iata: option.origin,
    dest_iata: option.dest,
    sched_dep_utc: option.schedDepUtc,
    sched_arr_utc: option.schedArrUtc,
    dep_local: option.depLocal,
    arr_local: option.arrLocal,
    headline: option.headline,
    pillars: option.pillars,
    reasons: option.reasons,
    segments: option.segments,
    recovery: option.recovery,
    evidence: {
      ...option.evidence,
      access: option.access,
      staffEligibility: option.staffEligibility,
      operatorVerification: option.operatorVerification,
      commercialFare: option.commercialFare,
      standbyClears: option.standbyClears,
    },
    refreshed_at: new Date().toISOString(),
    is_current: true,
  };
}

export function optionFromRow(
  row: Row,
  load: ReportedLoad | null,
  partySize = 1,
): StandbyOption {
  const pillars = ((row["pillars"] as Pillar[]) ?? []).slice();
  let judgment = (row["label"] as Judgment) ?? "mixed";
  let confidence = (row["confidence"] as Confidence) ?? "medium";
  let effective = pillars;

  if (load) {
    const reading = readLoad(load, { partySize });
    effective = pillars.map((p) =>
      p.key === "availability" ? loadPillar(load, { partySize }) : p,
    );
    judgment = judgeWithLoad(effective);
    confidence = confidenceWithLoad(effective, reading);
  }

  const evidence = (row["evidence"] as StandbyOption["evidence"]) ?? {
    availability: { checked: false, tested: [], largestShowing: null, checkedAt: null },
    conditions: null,
    history: null,
    holiday: null,
    recovery: (row["recovery"] as StandbyOption["evidence"]["recovery"]) ?? {
      state: "unknown",
      label: "Unknown",
      summary: "",
      hoursRemaining: null,
      laterNonstops: [],
      alternates: [],
    },
  };

  const standby: StandbyOption = {
    id: String(row["id"]),
    planId: String(row["plan_id"]),
    rank: Number(row["rank"] ?? 1),
    kind: (row["kind"] as "nonstop" | "connection") ?? "nonstop",
    judgment,
    confidence,
    headline: String(row["headline"] ?? ""),
    flightLabel: String(row["flight_label"] ?? ""),
    optionKey: (row["option_key"] as string | null) ?? null,
    carrier: (row["carrier"] as string | null) ?? null,
    flightNumber: (row["flight_number"] as string | null) ?? null,
    origin: String(row["origin_iata"] ?? ""),
    dest: String(row["dest_iata"] ?? ""),
    depLocal: String(row["dep_local"] ?? ""),
    arrLocal: String(row["arr_local"] ?? ""),
    schedDepUtc: (row["sched_dep_utc"] as string | null) ?? null,
    schedArrUtc: (row["sched_arr_utc"] as string | null) ?? null,
    segments: (row["segments"] as StandbyOption["segments"]) ?? [],
    pillars: effective,
    reasons: (row["reasons"] as Reason[]) ?? [],
    evidence: {
      ...evidence,
      recovery: (row["recovery"] as StandbyOption["evidence"]["recovery"]) ?? evidence.recovery,
    },
    load,
    refreshedAt: String(row["refreshed_at"] ?? new Date().toISOString()),
  };
  const ev = evidence as StandbyOption["evidence"];
  if (ev.access !== undefined) standby.access = ev.access;
  if (ev.staffEligibility) standby.staffEligibility = ev.staffEligibility;
  if (ev.operatorVerification) standby.operatorVerification = ev.operatorVerification;
  if (ev.commercialFare !== undefined) standby.commercialFare = ev.commercialFare;
  if (typeof ev.standbyClears === "number") standby.standbyClears = ev.standbyClears;
  return standby;
}

export async function buildPlan(
  client: unknown,
  userId: string,
  input: {
    origin: string;
    dest: string;
    travelDate: string;
    travelers: number;
    cabin: string;
    /** Client preference subset; server intersects with Travel Access. */
    carriers: string[] | null;
    maxStops?: number | undefined;
    nearby?: boolean | undefined;
    routingMode?: string | undefined;
  },
): Promise<{ planId: string; optionCount: number; reason: RankReason | null }> {
  const origin = input.origin.toUpperCase();
  const dest = input.dest.toUpperCase();

  await requireCanonicalAirports(client, [origin, dest]);

  const profile = await loadStandbyProfile(client, userId);
  const saved = resolveTravelAccess(profile ?? {});
  if (saved.codes.length === 0) {
    throw new Error("Set your travel access before building a plan.");
  }
  const effective = effectiveStaffTravelCarriers(saved, input.carriers);
  if (effective.length === 0) {
    throw new Error("That airline preference is outside your saved travel access.");
  }
  const accessPrefs = travelAccessSnapshot(saved, effective);

  const { data: planRow, error } = await db(client)
    .from("plans")
    .insert({
      user_id: userId,
      origin_iata: origin,
      dest_iata: dest,
      travel_date: input.travelDate,
      travelers: input.travelers,
      cabin: input.cabin,
      prefs: {
        carriers: effective,
        maxStops: input.maxStops ?? 1,
        nearby: input.nearby ?? false,
        routingMode: input.routingMode ?? "best",
        ...accessPrefs,
      },
    })
    .select("id")
    .single();
  if (error || !planRow) throw new Error(error?.message ?? "Could not start that plan.");

  const planId = String((planRow as Row)["id"]);
  const ranked = await rankStandbyOptions({
    origin,
    dest,
    travelDate: input.travelDate,
    carriers: effective,
    travelers: input.travelers,
    cabin: input.cabin,
    userId,
    maxStops: input.maxStops ?? 1,
    nearby: input.nearby ?? false,
    routingMode: (input.routingMode ?? "best") as RoutingMode,
    accessMeta: saved.meta,
  });

  await db(client)
    .from("plans")
    .update({
      prefs: {
        carriers: effective,
        maxStops: input.maxStops ?? 1,
        nearby: input.nearby ?? false,
        routingMode: input.routingMode ?? "best",
        emptyReason: ranked.reason,
        scanned: ranked.scanned,
        gateways: ranked.gateways,
        ...accessPrefs,
      },
    })
    .eq("id", planId);

  if (ranked.options.length > 0) {
    const persistable = await retainCanonicalSegmentOptions(client, ranked.options);
    if (persistable.length > 0) {
      await db(client)
        .from("plan_options")
        .insert(persistable.map((o) => optionInsert(planId, userId, o)));
    }
  }

  return { planId, optionCount: ranked.options.length, reason: ranked.reason };
}

export { UnresolvedAirportError };

/* --------------------------------- escape --------------------------------- */

/**
 * Escape: "I'm stuck, find me another way." Runs the wide network search and
 * stores it as a plan in escape mode.
 *
 * Standby Day accounting: an escape for a route/date the traveller already has
 * a plan for rides on that same Standby Day. It never opens a second one just
 * because Standbye recommends a different routing. Pricing is not live, so this
 * is recorded for later rules rather than charged or gated.
 */
export async function buildEscapePlan(
  client: unknown,
  userId: string,
  input: {
    origin: string;
    dest: string;
    travelDate: string;
    travelers: number;
    cabin: string;
    carriers: string[] | null;
    depTime?: string | undefined;
  },
): Promise<{ planId: string; optionCount: number; reason: RankReason | null }> {
  const origin = input.origin.toUpperCase();
  const dest = input.dest.toUpperCase();

  await requireCanonicalAirports(client, [origin, dest]);

  const profile = await loadStandbyProfile(client, userId);
  const saved = resolveTravelAccess(profile ?? {});
  const effective = effectiveStaffTravelCarriers(saved, input.carriers);
  if (effective.length === 0) {
    throw new Error("Set your travel access before widening a plan.");
  }
  const accessPrefs = travelAccessSnapshot(saved, effective);

  // An existing plan for the same problem means the Standby Day is already open.
  const { data: existing } = await db(client)
    .from("plans")
    .select("id")
    .eq("user_id", userId)
    .eq("origin_iata", origin)
    .eq("dest_iata", dest)
    .eq("travel_date", input.travelDate)
    .limit(1);
  const standbyDayShared = ((existing ?? []) as Row[]).length > 0;

  const basePrefs = {
    carriers: effective,
    maxStops: 1,
    nearby: false,
    routingMode: "wide" as const,
    mode: "escape" as const,
    depTime: input.depTime ?? null,
    standbyDayShared,
    ...accessPrefs,
  };

  const { data: planRow, error } = await db(client)
    .from("plans")
    .insert({
      user_id: userId,
      origin_iata: origin,
      dest_iata: dest,
      travel_date: input.travelDate,
      travelers: input.travelers,
      cabin: input.cabin,
      prefs: basePrefs,
    })
    .select("id")
    .single();
  if (error || !planRow) throw new Error(error?.message ?? "Could not start that escape.");

  const planId = String((planRow as Row)["id"]);
  const { rankEscapeRoutes } = await import("@/lib/aircue/ranking.server");
  const ranked = await rankEscapeRoutes({
    origin,
    dest,
    travelDate: input.travelDate,
    carriers: effective,
    travelers: input.travelers,
    cabin: input.cabin,
    userId,
    maxStops: 1,
    nearby: false,
    routingMode: "wide",
    accessMeta: saved.meta,
    ...(input.depTime ? { depTime: input.depTime } : {}),
  });

  await db(client)
    .from("plans")
    .update({
      prefs: {
        ...basePrefs,
        emptyReason: ranked.reason,
        scanned: { origins: [origin], dests: [dest] },
        gateways: ranked.gateways,
      },
    })
    .eq("id", planId);

  if (ranked.options.length > 0) {
    const persistable = await retainCanonicalSegmentOptions(client, ranked.options);
    if (persistable.length > 0) {
      await db(client)
        .from("plan_options")
        .insert(persistable.map((o) => optionInsert(planId, userId, o)));
    }
  }

  return { planId, optionCount: ranked.options.length, reason: ranked.reason };
}

/** The expert check: evaluate one traveller-named connecting airport. */
export async function checkEscapeViaAirport(
  client: unknown,
  userId: string,
  input: { planId: string; hub: string },
): Promise<{ optionId: string | null; gateway: GatewayOption | null; reason: string | null }> {
  const { data: planRow } = await db(client)
    .from("plans")
    .select("*")
    .eq("id", input.planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!planRow) return { optionId: null, gateway: null, reason: "We could not find that plan." };
  const plan = planRow as Row;
  const prefs = (plan["prefs"] ?? {}) as Record<string, unknown>;

  const { evaluateEscapeVia } = await import("@/lib/aircue/ranking.server");
  const result = await evaluateEscapeVia(
    {
      origin: String(plan["origin_iata"]),
      dest: String(plan["dest_iata"]),
      travelDate: String(plan["travel_date"]),
      carriers: (prefs["carriers"] as string[] | null) ?? null,
      travelers: Number(plan["travelers"] ?? 1),
      cabin: String(plan["cabin"] ?? "any"),
      userId,
      maxStops: 1,
      routingMode: "wide",
      ...(prefs["depTime"] ? { depTime: String(prefs["depTime"]) } : {}),
    },
    input.hub,
  );

  if (!result.option || !result.gateway) {
    return { optionId: null, gateway: null, reason: result.reason };
  }

  // Persist it alongside the escape's own options so it behaves like any other.
  const { data: existing } = await db(client)
    .from("plan_options")
    .select("rank")
    .eq("plan_id", input.planId)
    .order("rank", { ascending: false })
    .limit(1);
  const nextRank = ((existing ?? []) as Row[]).length
    ? Number(((existing ?? []) as Row[])[0]!["rank"]) + 1
    : 1;

  const { data: inserted } = await db(client)
    .from("plan_options")
    .insert({ ...optionInsert(input.planId, userId, { ...result.option, rank: nextRank }) })
    .select("id")
    .single();

  const gateways = ((prefs["gateways"] as GatewayOption[]) ?? []).filter(
    (g) => g.hub !== result.gateway!.hub,
  );
  await db(client)
    .from("plans")
    .update({ prefs: { ...prefs, gateways: [...gateways, result.gateway] } })
    .eq("id", input.planId);

  return {
    optionId: inserted ? String((inserted as Row)["id"]) : null,
    gateway: result.gateway,
    reason: null,
  };
}


async function loadsFor(
  client: unknown,
  userId: string,
  labels: string[],
  travelDate: string,
): Promise<Map<string, ReportedLoad>> {
  const map = new Map<string, ReportedLoad>();
  if (labels.length === 0) return map;
  const { data } = await db(client)
    .from("reported_loads")
    .select("*")
    .eq("user_id", userId)
    .eq("travel_date", travelDate)
    .in("flight_label", labels)
    .order("checked_at", { ascending: false });

  for (const raw of (data ?? []) as Row[]) {
    const label = String(raw["flight_label"]);
    if (map.has(label)) continue;
    map.set(label, {
      id: String(raw["id"]),
      openSeats: (raw["open_seats"] as number | null) ?? null,
      standbys: (raw["standbys"] as number | null) ?? null,
      cabin: String(raw["cabin"] ?? "economy"),
      source: String(raw["source"] ?? "employee_system"),
      partyIncluded: (raw["party_included"] as "yes" | "no" | "unsure" | null) ?? null,
      checkedAt: String(raw["checked_at"]),
    });
  }
  return map;
}

export async function loadPlan(
  client: unknown,
  userId: string,
  planId: string,
): Promise<StandbyPlan | null> {
  const { data: planRow } = await db(client)
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!planRow) return null;
  const plan = planRow as Row;

  const { data: optionRows } = await db(client)
    .from("plan_options")
    .select("*")
    .eq("plan_id", planId)
    .eq("is_current", true)
    .order("rank");

  const rows = (optionRows ?? []) as Row[];
  const loads = await loadsFor(
    client,
    userId,
    rows.map((r) => String(r["flight_label"])),
    String(plan["travel_date"]),
  );

  const partySize = Number(plan["travelers"] ?? 1);
  const options = rows.map((r) =>
    optionFromRow(r, loads.get(String(r["flight_label"])) ?? null, partySize),
  );
  options.sort((a, b) => a.rank - b.rank);

  const prefs = (plan["prefs"] ?? {}) as Record<string, unknown>;
  const scanned = (prefs["scanned"] ?? {}) as { origins?: string[]; dests?: string[] };
  const primaryOptionId = (plan["primary_option_id"] as string | null) ?? null;
  const preferredOptionId = options[0]?.id ?? null;

  const { data: watchRow } = await db(client)
    .from("watch_plans")
    .select("id,verdict,last_checked_at")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .eq("state", "active")
    .maybeSingle();

  const backupRunway = computeBackupRunway(options, primaryOptionId, {
    homeAirline: homeAirlineFromPrefs(prefs) ?? null,
  });

  return {
    id: planId,
    origin: String(plan["origin_iata"]),
    dest: String(plan["dest_iata"]),
    travelDate: String(plan["travel_date"]),
    travelers: Number(plan["travelers"] ?? 1),
    cabin: String(plan["cabin"] ?? "any"),
    options,
    noStrongSetup: options.length > 0 && options.every((o) => o.judgment !== "favorable"),
    emptyReason:
      options.length === 0
        ? ((prefs["emptyReason"] as StandbyPlan["emptyReason"]) ?? null)
        : null,
    scannedAirports: {
      origins: scanned["origins"] ?? [String(plan["origin_iata"])],
      dests: scanned["dests"] ?? [String(plan["dest_iata"])],
    },
    gateways: (prefs["gateways"] as GatewayOption[]) ?? [],
    routingMode: (prefs["routingMode"] as RoutingMode) ?? "best",
    mode: (prefs["mode"] as StandbyPlan["mode"]) ?? "standby",
    standbyDayShared: prefs["standbyDayShared"] === true,
    primaryOptionId,
    watching: Boolean(watchRow),
    watchId: watchRow ? String((watchRow as Row)["id"]) : null,
    planVerdict: watchRow ? String((watchRow as Row)["verdict"] ?? "steady") : null,
    lastCheckedAt: watchRow ? String((watchRow as Row)["last_checked_at"] ?? "") : null,
    preferredOptionId,
    backupRunway,
  };
}

export async function loadPlanSummaries(client: unknown, userId: string): Promise<PlanSummary[]> {
  const { data, error } = await db(client)
    .from("plans")
    .select(
      "id,origin_iata,dest_iata,travel_date,travelers,created_at,prefs,primary_option_id,plan_options!plan_options_plan_id_fkey(label,rank,flight_label,id,is_current,kind),watch_plans(state,verdict,last_checked_at)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.error("[loadPlanSummaries] plans query failed", error.message);
    throw new Error(`Could not load plans right now: ${error.message}`);
  }

  return ((data ?? []) as Row[]).map((row) => summarizePlanRow(row));
}

/** Committed Plans: primary selected and/or actively watched. */
export function isCommittedPlanSummary(plan: PlanSummary): boolean {
  return plan.hasPrimary || plan.watching;
}

export function partitionPlanSummaries(all: PlanSummary[]): {
  committed: PlanSummary[];
  recent: PlanSummary[];
} {
  const committed: PlanSummary[] = [];
  const recent: PlanSummary[] = [];
  for (const plan of all) {
    if (isCommittedPlanSummary(plan)) committed.push(plan);
    else recent.push(plan);
  }
  return { committed, recent };
}

export async function loadCommittedPlanSummaries(
  client: unknown,
  userId: string,
): Promise<PlanSummary[]> {
  const all = await loadPlanSummaries(client, userId);
  return partitionPlanSummaries(all).committed;
}

export async function loadRecentSearchSummaries(
  client: unknown,
  userId: string,
  limit = 8,
): Promise<PlanSummary[]> {
  const all = await loadPlanSummaries(client, userId);
  return partitionPlanSummaries(all).recent.slice(0, limit);
}

function summarizePlanRow(row: Row): PlanSummary {
  const opts = ((row["plan_options"] as Row[]) ?? [])
    .filter((o) => o["is_current"] !== false)
    .slice()
    .sort((a, b) => Number(a["rank"]) - Number(b["rank"]));
  const prefs = (row["prefs"] ?? {}) as Record<string, unknown>;
  const watches = ((row["watch_plans"] as Row[]) ?? []).filter((w) => w["state"] === "active");
  const watch = watches[0];
  const primaryId = (row["primary_option_id"] as string | null) ?? null;
  const hasPrimary = Boolean(primaryId);
  const primaryOpt = primaryId
    ? opts.find((o) => String(o["id"]) === primaryId)
    : null;
  const total = opts.length;
  const nonstops = opts.filter((o) => o["kind"] === "nonstop").length;
  const connections = opts.filter((o) => o["kind"] === "connection").length;
  const parts: string[] = [];
  if (nonstops > 0) parts.push(`${nonstops} nonstop${nonstops === 1 ? "" : "s"}`);
  if (connections > 0) parts.push(`${connections} connection${connections === 1 ? "" : "s"}`);
  const backupRunwaySummary =
    total === 0
      ? null
      : `${total} realistic way${total === 1 ? "" : "s"} remain${parts.length ? ` · ${parts.join(" · ")}` : ""}`;

  return {
    id: String(row["id"]),
    origin: String(row["origin_iata"]),
    dest: String(row["dest_iata"]),
    travelDate: String(row["travel_date"]),
    travelers: Number(row["travelers"] ?? 1),
    bestJudgment: opts[0] ? String(opts[0]["label"]) : null,
    optionCount: opts.length,
    createdAt: String(row["created_at"]),
    mode: (prefs["mode"] === "escape" ? "escape" : "standby") as "standby" | "escape",
    watching: watches.length > 0,
    planVerdict: watch ? String(watch["verdict"] ?? "steady") : null,
    lastCheckedAt: watch ? String(watch["last_checked_at"] ?? "") : null,
    primaryFlightLabel: primaryOpt ? String(primaryOpt["flight_label"]) : null,
    hasPrimary,
    backupRunwaySummary,
  };
}

export async function planFromFlightNumber(
  client: unknown,
  userId: string,
  input: { carrier: string; flightNumber: string; travelDate: string },
): Promise<{
  planId: string | null;
  optionId: string | null;
  legs: Array<{ origin: string; dest: string; depLocal: string }>;
  error: string | null;
}> {
  const { getFlightProvider } = await import("@/lib/aircue/flight-provider.server");
  const provider = getFlightProvider();
  const legs = await provider.resolveLegs(
    `${input.carrier}${input.flightNumber}`,
    input.travelDate,
    userId,
  );

  if (legs.length === 0) {
    return { planId: null, optionId: null, legs: [], error: "no_legs" };
  }

  const leg = legs[0];
  if (!leg) return { planId: null, optionId: null, legs: [], error: "no_legs" };

  const { planId } = await buildPlan(client, userId, {
    origin: leg.originIata,
    dest: leg.destIata,
    travelDate: input.travelDate,
    travelers: 1,
    cabin: "any",
    carriers: [input.carrier],
  });

  const { data } = await db(client)
    .from("plan_options")
    .select("id")
    .eq("plan_id", planId)
    .eq("flight_label", `${input.carrier}${input.flightNumber}`)
    .maybeSingle();

  const optionId = data ? String((data as Row)["id"]) : null;
  if (optionId) {
    await db(client)
      .from("plans")
      .update({ primary_option_id: optionId })
      .eq("id", planId);
  }

  return {
    planId,
    optionId,
    legs: legs.map((l) => ({
      origin: l.originIata,
      dest: l.destIata,
      depLocal: l.depLocalTime ?? "",
    })),
    error: null,
  };
}

/* --------------------------------- loads --------------------------------- */

export async function attachLoad(
  client: unknown,
  userId: string,
  input: {
    optionId: string;
    openSeats: number | null;
    standbys: number | null;
    cabin: string;
    source: string;
    partyIncluded: "yes" | "no" | "unsure" | null;
  },
): Promise<{
  optionId: string;
  judgment: string;
  /** Stored ranks moved because of this report. */
  reranked: boolean;
  topOptionId: string | null;
  topFlightLabel: string | null;
  previousTopOptionId: string | null;
  primaryOptionId: string | null;
}> {
  const { data: optionRow, error: optionError } = await db(client)
    .from("plan_options")
    .select("*, plans!plan_options_plan_id_fkey(travel_date,travelers,primary_option_id)")
    .eq("id", input.optionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (optionError) {
    console.error("[attachLoad] plan_options query failed", optionError.message);
    throw new Error(`Could not attach load right now: ${optionError.message}`);
  }
  if (!optionRow) throw new Error("That option is no longer available.");
  const row = optionRow as Row;
  const travelDate = String(((row["plans"] as Row) ?? {})["travel_date"] ?? "");

  const { data: inserted } = await db(client)
    .from("reported_loads")
    .insert({
      user_id: userId,
      flight_label: String(row["flight_label"]),
      travel_date: travelDate,
      open_seats: input.openSeats,
      standbys: input.standbys,
      cabin: input.cabin,
      source: input.source,
      party_included: input.partyIncluded,
      checked_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  const raw = (inserted ?? {}) as Row;
  const load: ReportedLoad = {
    id: String(raw["id"] ?? ""),
    openSeats: input.openSeats,
    standbys: input.standbys,
    cabin: input.cabin,
    source: input.source,
    partyIncluded: input.partyIncluded,
    checkedAt: String(raw["checked_at"] ?? new Date().toISOString()),
  };

  const planEmbed = (row["plans"] as Row) ?? {};
  const partySize = Number(planEmbed["travelers"] ?? 1);
  const primaryOptionId = (planEmbed["primary_option_id"] as string | null) ?? null;
  const planId = String(row["plan_id"]);

  const option = optionFromRow(row, load, partySize);
  const newScore = scoreWithLoad(option.pillars);

  const rerank = await rerankPlanAfterLoad(client, userId, planId, {
    optionId: option.id,
    score: newScore,
    judgment: option.judgment,
  });

  return {
    optionId: option.id,
    judgment: option.judgment,
    reranked: rerank.reranked,
    topOptionId: rerank.topOptionId,
    topFlightLabel: rerank.topFlightLabel,
    previousTopOptionId: rerank.previousTopOptionId,
    primaryOptionId,
  };
}

/**
 * Re-sort the plan's current options after a reported load changed one
 * option's score, and persist the new ranks. No provider calls: every other
 * option keeps its stored score.
 */
async function rerankPlanAfterLoad(
  client: unknown,
  userId: string,
  planId: string,
  changed: { optionId: string; score: number; judgment: Judgment },
): Promise<{
  reranked: boolean;
  topOptionId: string | null;
  topFlightLabel: string | null;
  previousTopOptionId: string | null;
}> {
  const { data } = await db(client)
    .from("plan_options")
    .select("id,rank,score,flight_label")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .eq("is_current", true)
    .order("rank");

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return { reranked: false, topOptionId: null, topFlightLabel: null, previousTopOptionId: null };
  }

  const previousTopOptionId = String(rows[0]!["id"]);
  const entries = rows.map((r) => {
    const id = String(r["id"]);
    return {
      id,
      flightLabel: String(r["flight_label"] ?? ""),
      previousRank: Number(r["rank"] ?? 1),
      score: id === changed.optionId ? changed.score : Number(r["score"] ?? 0),
    };
  });

  entries.sort((a, b) => b.score - a.score || a.previousRank - b.previousRank);

  let reranked = false;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const nextRank = i + 1;
    const isChanged = entry.id === changed.optionId;
    if (!isChanged && entry.previousRank === nextRank) continue;
    reranked = reranked || entry.previousRank !== nextRank;
    const update: Record<string, unknown> = { rank: nextRank };
    if (isChanged) {
      update["score"] = changed.score;
      update["label"] = changed.judgment;
    }
    await db(client).from("plan_options").update(update).eq("id", entry.id);
  }

  const top = entries[0]!;
  if (reranked) {
    const { data: watchRow } = await db(client)
      .from("watch_plans")
      .select("id")
      .eq("plan_id", planId)
      .eq("user_id", userId)
      .eq("state", "active")
      .maybeSingle();
    if (watchRow) {
      await db(client)
        .from("plan_change_events")
        .insert({
          watch_id: String((watchRow as Row)["id"]),
          user_id: userId,
          kind: "preferred_option_changed",
          severity: "meaningful",
          headline: `${top.flightLabel} is now the strongest option`,
          detail: "A load you reported changed how this plan ranks.",
        });
    }
  }

  return {
    reranked,
    topOptionId: top.id,
    topFlightLabel: top.flightLabel,
    previousTopOptionId,
  };
}

/* -------------------------------- watching -------------------------------- */

function planPrefsFromRow(planRow: Row): Record<string, unknown> {
  return (planRow["prefs"] ?? {}) as Record<string, unknown>;
}

async function syncPlanOptionsFromRanked(
  client: unknown,
  planId: string,
  userId: string,
  ranked: Awaited<ReturnType<typeof rankStandbyOptions>>,
  prefs: Record<string, unknown>,
  travelDate: string,
): Promise<StandbyOption[]> {
  const { data: existingRows } = await db(client)
    .from("plan_options")
    .select("*")
    .eq("plan_id", planId);

  const existing = (existingRows ?? []) as Row[];
  const claimedIds = new Set<string>();

  const loads = await loadsFor(
    client,
    userId,
    ranked.options.map((o) => o.flightLabel),
    travelDate,
  );

  const syncedIds = new Set<string>();
  const synced: StandbyOption[] = [];

  const persistable = await retainCanonicalSegmentOptions(client, ranked.options);

  for (const option of persistable) {
    const payload = optionInsert(planId, userId, option);
    const optionKey = String(payload.option_key ?? option.optionKey ?? "");
    const available = existing.filter((r) => !claimedIds.has(String(r["id"])));
    const prior = matchExistingOptionRow(
      available.map((r) => ({
        id: String(r["id"]),
        option_key: (r["option_key"] as string | null) ?? null,
        flight_label: String(r["flight_label"] ?? ""),
      })),
      { optionKey, flightLabel: option.flightLabel },
    );
    const priorRow = prior ? existing.find((r) => String(r["id"]) === prior.id) : null;
    if (priorRow) {
      const id = String(priorRow["id"]);
      claimedIds.add(id);
      await db(client).from("plan_options").update(payload).eq("id", id);
      syncedIds.add(id);
      synced.push(
        optionFromRow(
          { ...priorRow, ...payload, id, recovery: payload.recovery },
          loads.get(option.flightLabel) ?? null,
        ),
      );
    } else {
      const { data: inserted } = await db(client)
        .from("plan_options")
        .insert(payload)
        .select("*")
        .single();
      if (inserted) {
        const row = inserted as Row;
        syncedIds.add(String(row["id"]));
        synced.push(optionFromRow(row, loads.get(option.flightLabel) ?? null));
      }
    }
  }

  const staleIds = existing
    .map((r) => String(r["id"]))
    .filter((id) => !syncedIds.has(id));
  if (staleIds.length > 0) {
    await db(client)
      .from("plan_options")
      .update({ is_current: false })
      .in("id", staleIds);
  }

  await db(client)
    .from("plans")
    .update({
      prefs: {
        ...prefs,
        emptyReason: ranked.reason,
        scanned: ranked.scanned,
        gateways: ranked.gateways,
      },
    })
    .eq("id", planId);

  synced.sort((a, b) => a.rank - b.rank);
  return synced;
}

export async function setPrimaryOption(
  client: unknown,
  userId: string,
  planId: string,
  optionId: string,
): Promise<{ ok: true }> {
  const { data: optionRow } = await db(client)
    .from("plan_options")
    .select("*")
    .eq("id", optionId)
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .maybeSingle();
  if (!optionRow) throw new Error("That option is not part of this plan.");
  if ((optionRow as Row)["is_current"] === false) {
    throw new Error("That option is no longer current on this plan.");
  }

  await db(client)
    .from("plans")
    .update({ primary_option_id: optionId })
    .eq("id", planId)
    .eq("user_id", userId);

  const { data: watch } = await db(client)
    .from("watch_plans")
    .select("id")
    .eq("plan_id", planId)
    .eq("user_id", userId)
    .eq("state", "active")
    .maybeSingle();

  if (watch) {
    await db(client)
      .from("watch_plans")
      .update({ plan_option_id: optionId })
      .eq("id", String((watch as Row)["id"]));
  }

  // Lazy ADB operator verify on primary — never verify-all.
  try {
    const { data: planRow } = await db(client)
      .from("plans")
      .select("travel_date,prefs")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle();
    if (planRow) {
      const prefs = ((planRow as Row)["prefs"] ?? {}) as Record<string, unknown>;
      const option = optionFromRow(optionRow as Row, null);
      const identity = watchFlightIdentity(option);
      if (identity) {
        const allowed = effectiveCarriersFromPrefs(prefs);
        const meta = accessMetaFromPrefs(prefs);
        const truth = await verifyOperatorForFlight({
          flightNumber: identity.flightNumber,
          travelDate: String((planRow as Row)["travel_date"]),
          origin: identity.origin,
          dest: identity.dest,
          allowedAccess: allowed,
          ...(meta ? { accessMeta: meta } : {}),
          force: true,
        });
        await persistOperatorVerification(client, option, truth);
      }
    }
  } catch (error) {
    // Primary is set; verification is best-effort and must not undo intent.
    console.error("[setPrimaryOption] operator verify", error);
  }

  return { ok: true };
}

function initialWatchSnapshot(
  anchor: StandbyOption,
  primaryOptionId: string | null,
  options: StandbyOption[],
  homeAirline?: string | null,
): WatchSnapshot {
  const primary = options.find((o) => o.id === primaryOptionId) ?? null;
  const backup = computeBackupRunway(
    options,
    primaryOptionId,
    homeAirline !== undefined ? { homeAirline } : undefined,
  );
  return buildPlanWatchSnapshot({
    anchor,
    preferred: options[0] ?? null,
    primaryOptionId,
    flightState: "unknown",
    backup,
    spilloverCancelled: spilloverFromOption(anchor),
    primary,
  });
}

export async function beginWatch(
  client: unknown,
  userId: string,
  input: { planId?: string; optionId?: string; mode: string },
): Promise<{ watchId: string }> {
  let planId: string;
  let anchorOptionId: string;
  let anchorOption: StandbyOption;
  let allOptions: StandbyOption[] = [];

  if (input.planId) {
    const plan = await loadPlan(client, userId, input.planId);
    if (!plan) throw new Error("That plan is no longer available.");
    planId = plan.id;
    allOptions = plan.options;
    anchorOptionId = plan.primaryOptionId ?? plan.options[0]?.id ?? "";
    anchorOption = plan.options.find((o) => o.id === anchorOptionId) ?? plan.options[0]!;
    if (!anchorOption) throw new Error("This plan has no options to watch yet.");
  } else if (input.optionId) {
    const { data: optionRow } = await db(client)
      .from("plan_options")
      .select("*")
      .eq("id", input.optionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!optionRow) throw new Error("That option is no longer available.");
    anchorOption = optionFromRow(optionRow as Row, null);
    planId = anchorOption.planId;
    anchorOptionId = anchorOption.id;
    const plan = await loadPlan(client, userId, planId);
    allOptions = plan?.options ?? [anchorOption];
  } else {
    throw new Error("A plan or option is required to start watching.");
  }

  const { data: existing } = await db(client)
    .from("watch_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("state", "active")
    .maybeSingle();
  if (existing) return { watchId: String((existing as Row)["id"]) };

  const { data: planRow } = await db(client)
    .from("plans")
    .select("primary_option_id,prefs")
    .eq("id", planId)
    .maybeSingle();
  const primaryOptionId =
    ((planRow as Row | null)?.["primary_option_id"] as string | null) ?? anchorOptionId;
  const prefs = ((planRow as Row | null)?.["prefs"] ?? {}) as Record<string, unknown>;

  const { data, error } = await db(client)
    .from("watch_plans")
    .insert({
      user_id: userId,
      plan_option_id: anchorOptionId,
      plan_id: planId,
      mode: input.mode,
      state: "active",
      verdict: "steady",
      snapshot: initialWatchSnapshot(
        anchorOption,
        primaryOptionId,
        allOptions,
        homeAirlineFromPrefs(prefs),
      ),
      last_checked_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not start watching.");
  return { watchId: String((data as Row)["id"]) };
}

export async function loadWatches(client: unknown, userId: string): Promise<WatchSummary[]> {
  const { data } = await db(client)
    .from("watch_plans")
    .select("*, plan_options(*), plans(travel_date,origin_iata,dest_iata,primary_option_id)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as Row[];
  const watchIds = rows.map((row) => String(row["id"]));
  const headlines = new Map<string, string>();
  const primaryOptionIds = [
    ...new Set(
      rows
        .map((row) => {
          const plan = (row["plans"] as Row) ?? {};
          return plan["primary_option_id"] as string | null;
        })
        .filter(Boolean),
    ),
  ] as string[];
  const primaryLabels = new Map<string, string>();

  if (primaryOptionIds.length > 0) {
    const { data: primaryOpts } = await db(client)
      .from("plan_options")
      .select("id, flight_label, dep_local")
      .in("id", primaryOptionIds);
    for (const opt of (primaryOpts ?? []) as Row[]) {
      primaryLabels.set(String(opt["id"]), String(opt["flight_label"] ?? ""));
    }
  }

  if (watchIds.length > 0) {
    const { data: events } = await db(client)
      .from("plan_change_events")
      .select("watch_id, headline, occurred_at")
      .in("watch_id", watchIds)
      .eq("user_id", userId)
      .eq("seen", false)
      .order("occurred_at", { ascending: false });

    for (const event of (events ?? []) as Row[]) {
      const watchId = String(event["watch_id"]);
      if (!headlines.has(watchId)) {
        headlines.set(watchId, String(event["headline"] ?? ""));
      }
    }
  }

  return rows.map((row) => {
    const option = (row["plan_options"] as Row) ?? {};
    const plan = (row["plans"] as Row) ?? {};
    const id = String(row["id"]);
    const primaryOptionId = (plan["primary_option_id"] as string | null) ?? null;
    return {
      id,
      optionId: String(row["plan_option_id"]),
      planId: (row["plan_id"] as string | null) ?? null,
      flightLabel: String(option["flight_label"] ?? "Flight"),
      origin: String(plan["origin_iata"] ?? option["origin_iata"] ?? ""),
      dest: String(plan["dest_iata"] ?? option["dest_iata"] ?? ""),
      travelDate: String(plan["travel_date"] ?? ""),
      depLocal: String(option["dep_local"] ?? ""),
      judgment: String(option["label"] ?? "mixed"),
      verdict: String(row["verdict"] ?? "steady"),
      unseenChanges: Number(row["unseen_changes"] ?? 0),
      lastCheckedAt: String(row["last_checked_at"] ?? ""),
      state: String(row["state"] ?? "active"),
      latestHeadline: headlines.get(id) ?? null,
      primaryFlightLabel: primaryOptionId
        ? (primaryLabels.get(primaryOptionId) ?? null)
        : null,
    };
  });
}

export async function endWatch(
  client: unknown,
  userId: string,
  watchId: string,
): Promise<{ ok: true }> {
  await db(client)
    .from("watch_plans")
    .update({ state: "ended", ended_at: new Date().toISOString() })
    .eq("id", watchId)
    .eq("user_id", userId);
  return { ok: true };
}

export async function seenWatch(
  client: unknown,
  userId: string,
  watchId: string,
): Promise<{ ok: true }> {
  await db(client)
    .from("watch_plans")
    .update({ unseen_changes: 0 })
    .eq("id", watchId)
    .eq("user_id", userId);
  await db(client)
    .from("plan_change_events")
    .update({ seen: true })
    .eq("watch_id", watchId)
    .eq("user_id", userId);
  return { ok: true };
}

export async function loadWatchTimeline(
  client: unknown,
  userId: string,
  watchId: string,
): Promise<{ watch: WatchSummary | null; option: StandbyOption | null; changes: ChangeItem[] }> {
  const watches = await loadWatches(client, userId);
  const watch = watches.find((w) => w.id === watchId) ?? null;

  let option: StandbyOption | null = null;
  if (watch) {
    const { data: optionRow } = await db(client)
      .from("plan_options")
      .select("*")
      .eq("id", watch.optionId)
      .maybeSingle();
    if (optionRow) {
      const loads = await loadsFor(client, userId, [watch.flightLabel], watch.travelDate);
      option = optionFromRow(optionRow as Row, loads.get(watch.flightLabel) ?? null);
    }
  }

  const { data } = await db(client)
    .from("plan_change_events")
    .select("*")
    .eq("watch_id", watchId)
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  const changes: ChangeItem[] = ((data ?? []) as Row[]).map((row) => ({
    id: String(row["id"]),
    occurredAt: String(row["occurred_at"]),
    kind: String(row["kind"]),
    severity: String(row["severity"] ?? "context"),
    headline: String(row["headline"]),
    detail: (row["detail"] as string | null) ?? null,
    seen: Boolean(row["seen"]),
  }));

  return { watch, option, changes };
}

function reconciledToWatchFlightState(
  state: WatchSignalState["primary"]["state"],
): WatchFlightState {
  if (state === "cancelled") return "cancelled";
  if (state === "departed") return "departed";
  if (state === "unknown") return "unknown";
  return "operating";
}

function hoursUntilDep(schedDepUtc: string | null | undefined, travelDate: string, now: Date): number {
  if (schedDepUtc) {
    const t = new Date(schedDepUtc).getTime();
    if (Number.isFinite(t)) return (t - now.getTime()) / 3600_000;
  }
  const day = new Date(`${travelDate}T12:00:00Z`).getTime();
  return (day - now.getTime()) / 3600_000;
}

/** Re-check a Watch: gather cheap signals, gate, then rank only when needed. */
export async function recheckWatch(
  client: unknown,
  userId: string,
  watchId: string,
): Promise<{
  changed: boolean;
  outcome?: string;
  metrics?: {
    gf8Calls: number;
    adbFidsUpstream: number;
    adbStatusUpstream: number;
    operatorVerifyAttempts: number;
    rankingRan: boolean;
    operatorVerifyRan: boolean;
  };
}> {
  const started = Date.now();
  const usageBefore = snapshotProviderUsage();
  const { data: watchRow } = await db(client)
    .from("watch_plans")
    .select("*, plan_options(*), plans(*)")
    .eq("id", watchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!watchRow) return { changed: false };

  const row = watchRow as Row;
  const anchorRow = (row["plan_options"] as Row) ?? {};
  const planRow = (row["plans"] as Row) ?? {};
  const anchorBefore = optionFromRow(anchorRow, null);
  const prev = ((row["snapshot"] as WatchSnapshot | null) ??
    initialWatchSnapshot(anchorBefore, null, [anchorBefore])) as WatchSnapshot;
  let flightState: WatchFlightState = prev.flightState ?? "unknown";

  const prefs = planPrefsFromRow(planRow);
  const travelDate = String(planRow["travel_date"] ?? "");
  const planId = String(planRow["id"] ?? "");
  const primaryOptionId =
    (planRow["primary_option_id"] as string | null) ??
    prev.primaryOptionId ??
    String(row["plan_option_id"]);

  const events: Array<{ kind: string; severity: string; headline: string; detail: string }> = [];
  const now = new Date();
  const hours = hoursUntilDep(anchorBefore.schedDepUtc, travelDate, now);

  const cycleMetrics = (extra: { rankingRan: boolean; operatorVerifyRan: boolean }) => {
    const d = deltaProviderUsage(usageBefore);
    return {
      gf8Calls: d.gf8Upstream,
      adbFidsUpstream: d.adbFidsUpstream,
      adbStatusUpstream: d.adbStatusUpstream,
      operatorVerifyAttempts: d.operatorVerifyAttempts,
      rankingRan: extra.rankingRan,
      operatorVerifyRan: extra.operatorVerifyRan,
    };
  };

  const accessMeta =
    (prefs["accessMetaSnapshot"] as import("@/lib/aircue/travel-access").AirlineAccessMeta | undefined) ??
    (prefs["travelAccessSnapshot"] as { meta?: import("@/lib/aircue/travel-access").AirlineAccessMeta } | undefined)
      ?.meta;

  let gather;
  try {
    gather = await gatherWatchSignals({
      origin: String(planRow["origin_iata"]),
      dest: String(planRow["dest_iata"]),
      travelDate,
      planId,
      anchor: anchorBefore,
      hoursUntilDeparture: hours,
      prev: prev.signalState ?? null,
    });
  } catch (error) {
    console.error("[recheckWatch] gatherWatchSignals", error);
    gather = null;
  }

  if (gather) {
    if (!gather.statusUnavailable) {
      flightState = reconciledToWatchFlightState(gather.signals.primary.state);
      if (shouldEmitCancellation(prev.flightState, flightState)) {
        events.push(
          cancellationEvent(anchorBefore.flightLabel, anchorBefore.origin, anchorBefore.dest),
        );
      }
    } else if (gather.emitCancellationFromBoard) {
      flightState = "cancelled";
      if (shouldEmitCancellation(prev.flightState, "cancelled")) {
        events.push(
          cancellationEvent(anchorBefore.flightLabel, anchorBefore.origin, anchorBefore.dest),
        );
      }
    }
    // status unavailable without board cancel → keep previous flightState
  } else {
    // Fallback: legacy status-only path when gather fails entirely.
    const identity = watchFlightIdentity(anchorBefore);
    if (identity) {
      const { getFlightProvider } = await import("@/lib/aircue/flight-provider.server");
      const provider = getFlightProvider();
      const { status, unavailable } = await provider.getWatchStatus(
        identity.flightNumber,
        travelDate,
        planId,
        { origin: identity.origin, dest: identity.dest },
      );
      if (!unavailable && status) {
        const presence = classifyFlightStatus(status);
        if (presence.presence === "confirmed") {
          flightState = presence.state;
          if (shouldEmitCancellation(prev.flightState, flightState)) {
            events.push(
              cancellationEvent(anchorBefore.flightLabel, anchorBefore.origin, anchorBefore.dest),
            );
          }
        }
      }
    }
  }

  const decision = gather
    ? decideWatchOutcome(prev.signalState, gather.signals, {
        now,
        primaryStillCurrent: true,
      })
    : {
        outcome: "rerank" as const,
        trigger: "gather_failed",
        notifyEvents: [],
        forceStatusRefresh: false,
      };

  // Cancellation of primary is always rerank-worthy even if fingerprints match somehow.
  let outcome = decision.outcome;
  let trigger = decision.trigger;
  if (events.some((e) => e.kind === "flight_cancelled") && outcome === "skip") {
    outcome = "rerank";
    trigger = "primary_cancelled";
  }

  if (outcome === "skip" || outcome === "notify-only") {
    const notifyEvents = decision.notifyEvents;
    if (outcome === "notify-only") {
      events.push(...notifyEvents);
    }
    if (events.length > 0) {
      await db(client)
        .from("plan_change_events")
        .insert(
          events.map((e) => ({
            watch_id: watchId,
            user_id: userId,
            kind: e.kind,
            severity: e.severity,
            headline: e.headline,
            detail: e.detail,
          })),
        );
    }
    const meaningful = events.filter((e) => e.severity === "meaningful").length;
    const signalState = stampOutcomeOnSignals(
      gather!.signals,
      outcome,
      trigger,
    );
    const nextSnapshot: WatchSnapshot = {
      ...prev,
      flightState,
      signalState,
    };
    await db(client)
      .from("watch_plans")
      .update({
        snapshot: nextSnapshot,
        verdict: meaningful > 0 ? "changed" : String(row["verdict"] ?? "steady"),
        unseen_changes: Number(row["unseen_changes"] ?? 0) + meaningful,
        last_checked_at: now.toISOString(),
        next_check_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", watchId);

    logWatchCycle({
      watchId,
      planId,
      outcome,
      trigger,
      adbUnits: gather?.metrics.adbUnitsEst ?? 0,
      fidsCacheHit: gather?.metrics.fidsCacheHit ?? null,
      statusCacheHit: gather?.metrics.statusCacheHit ?? null,
      ...cycleMetrics({ rankingRan: false, operatorVerifyRan: false }),
      durationMs: Date.now() - started,
    });
    return {
      changed: meaningful > 0,
      outcome,
      metrics: cycleMetrics({ rankingRan: false, operatorVerifyRan: false }),
    };
  }

  // --- rerank path ---
  const ranked = await rankStandbyOptions({
    origin: String(planRow["origin_iata"]),
    dest: String(planRow["dest_iata"]),
    travelDate,
    carriers:
      (prefs["effectiveCarriers"] as string[] | null) ??
      (prefs["carriers"] as string[] | null) ??
      null,
    travelers: Number(planRow["travelers"] ?? 1),
    cabin: String(planRow["cabin"] ?? "any"),
    userId,
    maxStops: Number(prefs["maxStops"] ?? 1),
    nearby: Boolean(prefs["nearby"] ?? false),
    routingMode: (prefs["routingMode"] as RoutingMode) ?? "best",
    ...(accessMeta ? { accessMeta } : {}),
  });

  const rerankTrusted = !ranked.incomplete && ranked.reason !== "data_unavailable";
  let operatorVerifyRan = false;

  if (rerankTrusted) {
    const syncedOptions = await syncPlanOptionsFromRanked(
      client,
      planId,
      userId,
      ranked,
      prefs,
      travelDate,
    );
    const preferred = syncedOptions[0] ?? null;
    let primary = syncedOptions.find((o) => o.id === primaryOptionId) ?? null;
    let anchorFresh =
      syncedOptions.find((o) => o.id === String(row["plan_option_id"])) ??
      syncedOptions.find((o) => o.flightLabel === anchorBefore.flightLabel) ??
      null;

    const verifyTarget = primary ?? anchorFresh;
    const needsVerify =
      Boolean(verifyTarget) &&
      (verifyTarget!.operatorVerification?.status === "unverified" ||
        verifyTarget!.staffEligibility === "uncertain" ||
        trigger === "safety_refresh" ||
        trigger === "primary_cancelled" ||
        trigger === "bootstrap");

    if (verifyTarget && needsVerify) {
      const identity = watchFlightIdentity(verifyTarget);
      if (identity) {
        const allowed = effectiveCarriersFromPrefs(prefs);
        const meta = accessMetaFromPrefs(prefs);
        const truth = await verifyOperatorForFlight({
          flightNumber: identity.flightNumber,
          travelDate,
          origin: identity.origin,
          dest: identity.dest,
          allowedAccess: allowed,
          ...(meta ? { accessMeta: meta } : {}),
          force: trigger === "safety_refresh" || trigger === "bootstrap",
        });
        operatorVerifyRan = truth.attempted;
        const updated = await persistOperatorVerification(client, verifyTarget, truth);
        if (primary && primary.id === updated.id) primary = updated;
        if (anchorFresh && anchorFresh.id === updated.id) anchorFresh = updated;
        const idx = syncedOptions.findIndex((o) => o.id === updated.id);
        if (idx >= 0) syncedOptions[idx] = updated;
      }
    }

    const backup = computeBackupRunway(syncedOptions, primaryOptionId, {
      homeAirline: homeAirlineFromPrefs(prefs) ?? null,
    });
    const spillover = spilloverFromOption(anchorFresh ?? primary ?? preferred);

    events.push(
      ...detectPlanChangeEvents({
        prev,
        preferred,
        primary,
        backup,
        spilloverCancelled: spillover,
      }),
    );
    events.push(...detectAnchorOptionEvents(prev, anchorFresh));

    if (events.length > 0) {
      await db(client)
        .from("plan_change_events")
        .insert(
          events.map((e) => ({
            watch_id: watchId,
            user_id: userId,
            kind: e.kind,
            severity: e.severity,
            headline: e.headline,
            detail: e.detail,
          })),
        );
    }

    const meaningful = events.filter((e) => e.severity === "meaningful").length;
    const baseSignals =
      gather?.signals ??
      ({
        v: 1 as const,
        checkedAt: now.toISOString(),
        nextSafetyRefreshAt: now.toISOString(),
        primary: {
          flightNumber: anchorBefore.flightLabel,
          origin: anchorBefore.origin,
          dest: anchorBefore.dest,
          state: flightState === "cancelled" ? "cancelled" : flightState === "departed" ? "departed" : flightState === "unknown" ? "unknown" : "operating",
          source: "status" as const,
        },
        cancelPressure: {
          origin: String(planRow["origin_iata"]),
          date: travelDate,
          windowKey: "",
          byRoute: {},
        },
        environment: {
          faaFingerprint: "na",
          weatherBand: "clear" as const,
          weatherFingerprint: "na",
        },
        lastRankAt: null,
        lastRankTrigger: null,
        lastOutcome: "rerank" as const,
      } satisfies WatchSignalState);

    const signalState = stampRankOnSignals(baseSignals, trigger, hours, now);
    const nextSnapshot = buildPlanWatchSnapshot({
      anchor: anchorFresh ?? anchorBefore,
      preferred,
      primaryOptionId,
      flightState,
      backup,
      spilloverCancelled: spillover,
      prev,
      primary,
      signalState,
    });

    await db(client)
      .from("watch_plans")
      .update({
        snapshot: nextSnapshot,
        verdict: meaningful > 0 ? "changed" : "steady",
        unseen_changes: Number(row["unseen_changes"] ?? 0) + meaningful,
        last_checked_at: now.toISOString(),
        next_check_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", watchId);

    logWatchCycle({
      watchId,
      planId,
      outcome: "rerank",
      trigger,
      adbUnits: gather?.metrics.adbUnitsEst ?? 0,
      fidsCacheHit: gather?.metrics.fidsCacheHit ?? null,
      statusCacheHit: gather?.metrics.statusCacheHit ?? null,
      ...cycleMetrics({ rankingRan: true, operatorVerifyRan }),
      durationMs: Date.now() - started,
    });

    return {
      changed: meaningful > 0,
      outcome: "rerank",
      metrics: cycleMetrics({ rankingRan: true, operatorVerifyRan }),
    };
  }

  // Failed / incomplete rerank: preserve last known-good plan + snapshot runway.
  if (events.length > 0) {
    await db(client)
      .from("plan_change_events")
      .insert(
        events.map((e) => ({
          watch_id: watchId,
          user_id: userId,
          kind: e.kind,
          severity: e.severity,
          headline: e.headline,
          detail: e.detail,
        })),
      );
  }

  const meaningful = events.filter((e) => e.severity === "meaningful").length;
  const preservedSignals = gather
    ? stampOutcomeOnSignals(gather.signals, "rerank", trigger)
    : prev.signalState;
  const preservedSnapshot: WatchSnapshot = {
    judgment: prev.judgment,
    pillars: prev.pillars,
    largestShowing: prev.largestShowing,
    laterCount: prev.laterCount,
    flightState,
    primaryOptionId: prev.primaryOptionId ?? primaryOptionId,
    preferredOptionId: prev.preferredOptionId ?? null,
    ...(preservedSignals ? { signalState: preservedSignals } : {}),
  };
  if (prev.backupRunwayCount !== undefined) {
    preservedSnapshot.backupRunwayCount = prev.backupRunwayCount;
  }
  if (prev.backupNonstopCount !== undefined) {
    preservedSnapshot.backupNonstopCount = prev.backupNonstopCount;
  }
  if (prev.backupConnectionCount !== undefined) {
    preservedSnapshot.backupConnectionCount = prev.backupConnectionCount;
  }
  if (prev.spilloverCancelled !== undefined) {
    preservedSnapshot.spilloverCancelled = prev.spilloverCancelled;
  }

  await db(client)
    .from("watch_plans")
    .update({
      snapshot: preservedSnapshot,
      verdict: meaningful > 0 ? "changed" : String(row["verdict"] ?? "steady"),
      unseen_changes: Number(row["unseen_changes"] ?? 0) + meaningful,
      last_checked_at: now.toISOString(),
      next_check_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    })
    .eq("id", watchId);

  logWatchCycle({
    watchId,
    planId,
    outcome: "rerank",
    trigger: trigger ?? "incomplete",
    adbUnits: gather?.metrics.adbUnitsEst ?? 0,
    fidsCacheHit: gather?.metrics.fidsCacheHit ?? null,
    statusCacheHit: gather?.metrics.statusCacheHit ?? null,
    ...cycleMetrics({ rankingRan: true, operatorVerifyRan: false }),
    durationMs: Date.now() - started,
  });

  return {
    changed: meaningful > 0,
    outcome: "rerank",
    metrics: cycleMetrics({ rankingRan: true, operatorVerifyRan: false }),
  };
}

/** Most recent reported load for one flight on one date, if any. */
export async function latestLoadFor(
  client: unknown,
  userId: string,
  flightLabel: string,
  travelDate: string,
): Promise<ReportedLoad | null> {
  const loads = await loadsFor(client, userId, [flightLabel], travelDate);
  return loads.get(flightLabel) ?? null;
}
