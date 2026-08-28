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
  };
}

export async function loadPlanSummaries(client: unknown, userId: string): Promise<PlanSummary[]> {
  const { data } = await db(client)
    .from("plans")
    .select("id,origin_iata,dest_iata,travel_date,travelers,created_at,prefs,plan_options(label,rank)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  return ((data ?? []) as Row[]).map((row) => {
    const opts = ((row["plan_options"] as Row[]) ?? []).slice().sort(
      (a, b) => Number(a["rank"]) - Number(b["rank"]),
    );
    const prefs = (row["prefs"] ?? {}) as Record<string, unknown>;
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
    };
  });
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

  return {
    planId,
    optionId: data ? String((data as Row)["id"]) : null,
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
  const { data: optionRow } = await db(client)
    .from("plan_options")
    .select("*, plans(travel_date)")
    .eq("id", input.optionId)
    .eq("user_id", userId)
    .maybeSingle();
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

function snapshotOf(option: StandbyOption) {
  return {
    judgment: option.judgment,
    pillars: Object.fromEntries(option.pillars.map((p) => [p.key, p.state])),
    largestShowing: option.evidence.availability.largestShowing,
    laterCount: option.evidence.recovery.laterNonstops.length,
  };
}

export async function beginWatch(
  client: unknown,
  userId: string,
  input: { optionId: string; mode: string },
): Promise<{ watchId: string }> {
  const { data: optionRow } = await db(client)
    .from("plan_options")
    .select("*")
    .eq("id", input.optionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!optionRow) throw new Error("That option is no longer available.");
  const option = optionFromRow(optionRow as Row, null);

  const { data: existing } = await db(client)
    .from("watch_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_option_id", input.optionId)
    .eq("state", "active")
    .maybeSingle();
  if (existing) return { watchId: String((existing as Row)["id"]) };

  const { data, error } = await db(client)
    .from("watch_plans")
    .insert({
      user_id: userId,
      plan_option_id: input.optionId,
      plan_id: option.planId,
      mode: input.mode,
      state: "active",
      verdict: "steady",
      snapshot: snapshotOf(option),
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
    .select("*, plan_options(*), plans(travel_date)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return ((data ?? []) as Row[]).map((row) => {
    const option = (row["plan_options"] as Row) ?? {};
    const plan = (row["plans"] as Row) ?? {};
    return {
      id: String(row["id"]),
      optionId: String(row["plan_option_id"]),
      planId: (row["plan_id"] as string | null) ?? null,
      flightLabel: String(option["flight_label"] ?? "Flight"),
      origin: String(option["origin_iata"] ?? ""),
      dest: String(option["dest_iata"] ?? ""),
      travelDate: String(plan["travel_date"] ?? ""),
      depLocal: String(option["dep_local"] ?? ""),
      judgment: String(option["label"] ?? "mixed"),
      verdict: String(row["verdict"] ?? "steady"),
      unseenChanges: Number(row["unseen_changes"] ?? 0),
      lastCheckedAt: String(row["last_checked_at"] ?? ""),
      state: String(row["state"] ?? "active"),
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

/** Re-rank the watched option and record only meaningful movement. */
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
  const optionRow = (row["plan_options"] as Row) ?? {};
  const planRow = (row["plans"] as Row) ?? {};
  const before = optionFromRow(optionRow, null);
  const prev = (row["snapshot"] as ReturnType<typeof snapshotOf>) ?? snapshotOf(before);

  const ranked = await rankStandbyOptions({
    origin: String(optionRow["origin_iata"]),
    dest: String(optionRow["dest_iata"]),
    travelDate: String(planRow["travel_date"] ?? ""),
    carriers: optionRow["carrier"] ? [String(optionRow["carrier"])] : null,
    travelers: Number(planRow["travelers"] ?? 1),
    cabin: String(planRow["cabin"] ?? "any"),
    userId,
  });

  const fresh = ranked.options.find((o) => o.flightLabel === before.flightLabel);
  if (!fresh) return { changed: false };

  await db(client)
    .from("plan_options")
    .update({
      label: fresh.judgment,
      confidence: fresh.confidence,
      score: fresh.score,
      headline: fresh.headline,
      pillars: fresh.pillars,
      reasons: fresh.reasons,
      recovery: fresh.recovery,
      evidence: fresh.evidence,
      refreshed_at: new Date().toISOString(),
    })
    .eq("id", before.id);

  const events: Array<{ kind: string; severity: string; headline: string; detail: string }> = [];
  if (fresh.judgment !== prev.judgment) {
    events.push({
      kind: "judgment",
      severity: "meaningful",
      headline:
        fresh.judgment === "favorable"
          ? "This setup improved"
          : fresh.judgment === "riskier"
            ? "This setup got harder"
            : "This setup shifted",
      detail: fresh.headline,
    });
  }

  const prevLargest = prev.largestShowing;
  const nextLargest = fresh.evidence.availability.largestShowing;
  if (prevLargest !== null && nextLargest !== null && nextLargest < prevLargest) {
    events.push({
      kind: "availability",
      severity: nextLargest === 0 ? "meaningful" : "context",
      headline:
        nextLargest === 0
          ? "Public availability has closed"
          : "Public availability tightened",
      detail: `Booking now shows for parties up to ${nextLargest}, down from ${prevLargest}. This is a demand signal, not a load.`,
    });
  }

  const prevOps = prev.pillars?.["operations"];
  const nextOps = fresh.pillars.find((p) => p.key === "operations")?.state;
  if (prevOps && nextOps && prevOps !== nextOps && nextOps === "poor") {
    events.push({
      kind: "operations",
      severity: "meaningful",
      headline: "Operations turned against this plan",
      detail: fresh.pillars.find((p) => p.key === "operations")?.detail ?? "",
    });
  }

  const laterNow = fresh.recovery.laterNonstops.length;
  if (laterNow < (prev.laterCount ?? 0)) {
    events.push({
      kind: "recovery",
      severity: laterNow === 0 ? "meaningful" : "context",
      headline: laterNow === 0 ? "You are out of backup options" : "Backup options thinned out",
      detail: fresh.recovery.summary,
    });
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
  await db(client)
    .from("watch_plans")
    .update({
      snapshot: snapshotOf({ ...before, judgment: fresh.judgment, pillars: fresh.pillars, evidence: { ...before.evidence, availability: fresh.evidence.availability, recovery: fresh.recovery } }),
      verdict: meaningful > 0 ? "changed" : "steady",
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
