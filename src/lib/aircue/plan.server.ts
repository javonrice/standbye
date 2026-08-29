/** Server-only persistence and orchestration for the standby decision engine. */
import type { SupabaseClient } from "@supabase/supabase-js";

import { rankStandbyOptions, type RankedOption, type RankReason } from "@/lib/aircue/ranking.server";
import { confidenceWithLoad, judgeWithLoad, loadPillar } from "@/lib/aircue/load-adjust";
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

/** The generated Database type does not yet know the standby tables. */
type Db = SupabaseClient;
const db = (client: unknown) => client as Db;

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
  return {
    homeAirline: String(row["home_airline"] ?? "UA"),
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
      onboarded_at: values.onboarded ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  return values;
}


/* --------------------------------- plans --------------------------------- */

function optionInsert(planId: string, userId: string, option: RankedOption) {
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
    evidence: option.evidence,
    refreshed_at: new Date().toISOString(),
    is_current: true,
  };
}

export function optionFromRow(row: Row, load: ReportedLoad | null): StandbyOption {
  const pillars = ((row["pillars"] as Pillar[]) ?? []).slice();
  let judgment = (row["label"] as Judgment) ?? "mixed";
  let confidence = (row["confidence"] as Confidence) ?? "medium";
  let effective = pillars;

  if (load) {
    effective = pillars.map((p) => (p.key === "availability" ? loadPillar(load) : p));
    judgment = judgeWithLoad(effective);
    confidence = confidenceWithLoad(effective);
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

  return {
    id: String(row["id"]),
    planId: String(row["plan_id"]),
    rank: Number(row["rank"] ?? 1),
    kind: (row["kind"] as "nonstop" | "connection") ?? "nonstop",
    judgment,
    confidence,
    headline: String(row["headline"] ?? ""),
    flightLabel: String(row["flight_label"] ?? ""),
    carrier: (row["carrier"] as string | null) ?? null,
    flightNumber: (row["flight_number"] as string | null) ?? null,
    origin: String(row["origin_iata"] ?? ""),
    dest: String(row["dest_iata"] ?? ""),
    depLocal: String(row["dep_local"] ?? ""),
    arrLocal: String(row["arr_local"] ?? ""),
    schedDepUtc: (row["sched_dep_utc"] as string | null) ?? null,
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
    carriers: string[] | null;
    maxStops?: number | undefined;
    nearby?: boolean | undefined;
    routingMode?: string | undefined;
  },
): Promise<{ planId: string; optionCount: number; reason: RankReason | null }> {
  const { data: planRow, error } = await db(client)
    .from("plans")
    .insert({
      user_id: userId,
      origin_iata: input.origin.toUpperCase(),
      dest_iata: input.dest.toUpperCase(),
      travel_date: input.travelDate,
      travelers: input.travelers,
      cabin: input.cabin,
      prefs: {
        carriers: input.carriers,
        maxStops: input.maxStops ?? 1,
        nearby: input.nearby ?? false,
        routingMode: input.routingMode ?? "best",
      },
    })
    .select("id")
    .single();
  if (error || !planRow) throw new Error(error?.message ?? "Could not start that plan.");

  const planId = String((planRow as Row)["id"]);
  const ranked = await rankStandbyOptions({
    origin: input.origin.toUpperCase(),
    dest: input.dest.toUpperCase(),
    travelDate: input.travelDate,
    carriers: input.carriers,
    travelers: input.travelers,
    cabin: input.cabin,
    userId,
    maxStops: input.maxStops ?? 1,
    nearby: input.nearby ?? false,
    routingMode: (input.routingMode ?? "best") as RoutingMode,
  });

  await db(client)
    .from("plans")
    .update({
      prefs: {
        carriers: input.carriers,
        maxStops: input.maxStops ?? 1,
        nearby: input.nearby ?? false,
        routingMode: input.routingMode ?? "best",
        emptyReason: ranked.reason,
        scanned: ranked.scanned,
        gateways: ranked.gateways,
      },
    })
    .eq("id", planId);

  if (ranked.options.length > 0) {
    await db(client)
      .from("plan_options")
      .insert(ranked.options.map((o) => optionInsert(planId, userId, o)));
  }

  return { planId, optionCount: ranked.options.length, reason: ranked.reason };
}

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
    carriers: input.carriers,
    maxStops: 1,
    nearby: false,
    routingMode: "wide" as const,
    mode: "escape" as const,
    depTime: input.depTime ?? null,
    standbyDayShared,
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
    carriers: input.carriers,
    travelers: input.travelers,
    cabin: input.cabin,
    userId,
    maxStops: 1,
    nearby: false,
    routingMode: "wide",
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
    await db(client)
      .from("plan_options")
      .insert(ranked.options.map((o) => optionInsert(planId, userId, o)));
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

  const options = rows.map((r) => optionFromRow(r, loads.get(String(r["flight_label"])) ?? null));
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

  const backupRunway = computeBackupRunway(options, primaryOptionId);

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
  },
): Promise<{ optionId: string; judgment: string }> {
  const { data: optionRow, error: optionError } = await db(client)
    .from("plan_options")
    .select("*, plans!plan_options_plan_id_fkey(travel_date)")
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
    checkedAt: String(raw["checked_at"] ?? new Date().toISOString()),
  };

  const option = optionFromRow(row, load);
  return { optionId: option.id, judgment: option.judgment };
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
  const byLabel = new Map(existing.map((r) => [String(r["flight_label"]), r]));

  const loads = await loadsFor(
    client,
    userId,
    ranked.options.map((o) => o.flightLabel),
    travelDate,
  );

  const syncedIds = new Set<string>();
  const synced: StandbyOption[] = [];

  for (const option of ranked.options) {
    const payload = optionInsert(planId, userId, option);
    const prior = byLabel.get(option.flightLabel);
    if (prior) {
      const id = String(prior["id"]);
      await db(client).from("plan_options").update(payload).eq("id", id);
      syncedIds.add(id);
      synced.push(
        optionFromRow(
          { ...prior, ...payload, id, recovery: payload.recovery },
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
    .select("id,plan_id,is_current")
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

  return { ok: true };
}

function initialWatchSnapshot(
  anchor: StandbyOption,
  primaryOptionId: string | null,
  options: StandbyOption[],
): WatchSnapshot {
  const backup = computeBackupRunway(options, primaryOptionId);
  return buildPlanWatchSnapshot({
    anchor,
    preferred: options[0] ?? null,
    primaryOptionId,
    flightState: "unknown",
    backup,
    spilloverCancelled: spilloverFromOption(anchor),
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
    .select("primary_option_id")
    .eq("id", planId)
    .maybeSingle();
  const primaryOptionId =
    ((planRow as Row | null)?.["primary_option_id"] as string | null) ?? anchorOptionId;

  const { data, error } = await db(client)
    .from("watch_plans")
    .insert({
      user_id: userId,
      plan_option_id: anchorOptionId,
      plan_id: planId,
      mode: input.mode,
      state: "active",
      verdict: "steady",
      snapshot: initialWatchSnapshot(anchorOption, primaryOptionId, allOptions),
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

/** Re-rank the watched plan and record only meaningful movement. */
export async function recheckWatch(
  client: unknown,
  userId: string,
  watchId: string,
): Promise<{ changed: boolean }> {
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

  const ranked = await rankStandbyOptions({
    origin: String(planRow["origin_iata"]),
    dest: String(planRow["dest_iata"]),
    travelDate,
    carriers: (prefs["carriers"] as string[] | null) ?? null,
    travelers: Number(planRow["travelers"] ?? 1),
    cabin: String(planRow["cabin"] ?? "any"),
    userId,
    maxStops: Number(prefs["maxStops"] ?? 1),
    nearby: Boolean(prefs["nearby"] ?? false),
    routingMode: (prefs["routingMode"] as RoutingMode) ?? "best",
  });

  const rerankTrusted = !ranked.incomplete && ranked.reason !== "data_unavailable";

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
    const primary = syncedOptions.find((o) => o.id === primaryOptionId) ?? null;
    const anchorFresh =
      syncedOptions.find((o) => o.id === String(row["plan_option_id"])) ??
      syncedOptions.find((o) => o.flightLabel === anchorBefore.flightLabel) ??
      null;

    const backup = computeBackupRunway(syncedOptions, primaryOptionId);
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
    const nextSnapshot = buildPlanWatchSnapshot({
      anchor: anchorFresh ?? anchorBefore,
      preferred,
      primaryOptionId,
      flightState,
      backup,
      spilloverCancelled: spillover,
      prev,
    });

    await db(client)
      .from("watch_plans")
      .update({
        snapshot: nextSnapshot,
        verdict: meaningful > 0 ? "changed" : "steady",
        unseen_changes: Number(row["unseen_changes"] ?? 0) + meaningful,
        last_checked_at: new Date().toISOString(),
        next_check_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", watchId);

    return { changed: meaningful > 0 };
  }

  // Failed / incomplete rerank: preserve last known-good plan + snapshot runway.
  // Feature #1 cancellation events (already in `events`) still persist.
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
  const preservedSnapshot: WatchSnapshot = {
    judgment: prev.judgment,
    pillars: prev.pillars,
    largestShowing: prev.largestShowing,
    laterCount: prev.laterCount,
    flightState,
    primaryOptionId: prev.primaryOptionId ?? primaryOptionId,
    preferredOptionId: prev.preferredOptionId ?? null,
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
      last_checked_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq("id", watchId);

  return { changed: meaningful > 0 };
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
