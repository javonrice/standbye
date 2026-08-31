/**
 * Plan lifecycle — pure resolution plus an explicit write orchestrator.
 *
 * loadPlan() stays read-only. Call resolveAndPersistPlanLifecycle() from paths
 * that own lifecycle transitions (Home current plan, watch recheck, cron).
 */
import type { StandbyOption, StandbyPlan } from "@/lib/aircue/standby";
import type { PlanSummary } from "@/lib/aircue/plan.functions";

export type PlanLifecycleStatus = "active" | "complete";

export interface PlanLifecycleResult {
  status: PlanLifecycleStatus;
  /** Resolved current option — may differ from persisted primary after advance. */
  currentOptionId: string | null;
  /** Whether primary_option_id should be updated in DB. */
  primaryAdvanced: boolean;
  newPrimaryOptionId: string | null;
  /** Whether watch should end (plan complete). */
  shouldEndWatch: boolean;
  /** Options still actionable in travel window. */
  actionableOptionIds: string[];
}

const DEFAULT_GRACE_MS = 0;

function staffEligibility(option: StandbyOption): StandbyOption["staffEligibility"] {
  return option.staffEligibility ?? option.evidence.staffEligibility ?? "eligible";
}

export function isOptionDeparted(
  option: StandbyOption,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): boolean {
  if (!option.schedDepUtc) return false;
  const t = new Date(option.schedDepUtc).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime() - graceMs;
}

/** An option can still become the traveler's current plan flight. */
export function isOptionActionable(
  option: StandbyOption,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): boolean {
  if (staffEligibility(option) === "ineligible") return false;
  if (!option.schedDepUtc) return false;
  return !isOptionDeparted(option, now, graceMs);
}

export function actionableOptions(
  options: StandbyOption[],
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): StandbyOption[] {
  return [...options]
    .filter((o) => isOptionActionable(o, now, graceMs))
    .sort((a, b) => a.rank - b.rank);
}

export function nextActionableOption(
  options: StandbyOption[],
  afterOptionId: string | null,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): StandbyOption | null {
  const actionable = actionableOptions(options, now, graceMs);
  if (actionable.length === 0) return null;
  if (!afterOptionId) return actionable[0] ?? null;
  const afterRank = options.find((o) => o.id === afterOptionId)?.rank ?? -1;
  return actionable.find((o) => o.rank > afterRank) ?? actionable[0] ?? null;
}

function storedLifecycleStatus(plan: StandbyPlan): PlanLifecycleStatus | null {
  const status = plan.lifecycleStatus;
  return status === "complete" || status === "active" ? status : null;
}

function resolvedCurrentOptionId(plan: StandbyPlan, now: Date): string | null {
  const anchorId =
    plan.primaryOptionId ?? plan.preferredOptionId ?? plan.options[0]?.id ?? null;
  if (!anchorId) {
    return actionableOptions(plan.options, now)[0]?.id ?? null;
  }
  const anchor = plan.options.find((o) => o.id === anchorId);
  if (anchor && isOptionActionable(anchor, now)) return anchorId;
  return nextActionableOption(plan.options, anchorId, now)?.id ?? null;
}

/** Pure — no DB I/O. */
export function resolvePlanLifecycle(
  plan: StandbyPlan,
  now: Date = new Date(),
): PlanLifecycleResult {
  const stored = storedLifecycleStatus(plan);
  const actionableIds = actionableOptions(plan.options, now).map((o) => o.id);

  if (stored === "complete") {
    return {
      status: "complete",
      currentOptionId: plan.primaryOptionId,
      primaryAdvanced: false,
      newPrimaryOptionId: null,
      shouldEndWatch: true,
      actionableOptionIds: [],
    };
  }

  if (actionableIds.length === 0) {
    return {
      status: "complete",
      currentOptionId: null,
      primaryAdvanced: false,
      newPrimaryOptionId: null,
      shouldEndWatch: true,
      actionableOptionIds: [],
    };
  }

  const currentOptionId = resolvedCurrentOptionId(plan, now);
  const persistedPrimary = plan.primaryOptionId;
  const anchorId =
    persistedPrimary ?? plan.preferredOptionId ?? plan.options[0]?.id ?? null;
  const anchor = anchorId ? plan.options.find((o) => o.id === anchorId) : null;
  const anchorDeparted = anchor ? isOptionDeparted(anchor, now) : false;

  const primaryAdvanced =
    Boolean(persistedPrimary) &&
    Boolean(currentOptionId) &&
    currentOptionId !== persistedPrimary &&
    anchorDeparted;

  return {
    status: "active",
    currentOptionId,
    primaryAdvanced,
    newPrimaryOptionId: primaryAdvanced ? currentOptionId : null,
    shouldEndWatch: false,
    actionableOptionIds: actionableIds,
  };
}

/** Apply pure resolution to a StandbyPlan for read-only display (no persist). */
export function applyLifecycleView(
  plan: StandbyPlan,
  result: PlanLifecycleResult,
): StandbyPlan {
  const resolvedPrimary =
    result.status === "active" && result.currentOptionId
      ? result.currentOptionId
      : plan.primaryOptionId;

  return {
    ...plan,
    primaryOptionId: resolvedPrimary,
    lifecycleStatus: result.status,
    isActionable: result.status === "active" && result.actionableOptionIds.length > 0,
    lifecycleResolvedAt: plan.lifecycleResolvedAt ?? null,
  };
}

/** Local calendar YYYY-MM-DD — matches Home date grouping. */
export function localTodayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Pick Home current plan among actionable summaries (soonest date, newest created). */
export function pickActionablePlan(
  plans: PlanSummary[],
  todayISO: string,
): PlanSummary | null {
  const candidates = plans.filter(
    (p) =>
      p.travelDate >= todayISO &&
      p.lifecycleStatus !== "complete" &&
      p.isActionable !== false,
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    if (a.travelDate !== b.travelDate) return a.travelDate < b.travelDate ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return sorted[0] ?? null;
}

function lifecycleStatusFromPrefs(prefs: Record<string, unknown>): PlanLifecycleStatus {
  const raw = prefs["lifecycleStatus"];
  return raw === "complete" ? "complete" : "active";
}

export function lifecycleFieldsFromPrefs(prefs: Record<string, unknown>): {
  lifecycleStatus: PlanLifecycleStatus;
  lifecycleResolvedAt: string | null;
} {
  return {
    lifecycleStatus: lifecycleStatusFromPrefs(prefs),
    lifecycleResolvedAt:
      typeof prefs["lifecycleResolvedAt"] === "string" ? prefs["lifecycleResolvedAt"] : null,
  };
}

export function enrichPlanWithPrefsLifecycle(
  plan: StandbyPlan,
  prefs: Record<string, unknown>,
): StandbyPlan {
  const { lifecycleStatus, lifecycleResolvedAt } = lifecycleFieldsFromPrefs(prefs);
  return {
    ...plan,
    lifecycleStatus,
    lifecycleResolvedAt,
    isActionable: lifecycleStatus !== "complete",
  };
}

export function summaryIsActionable(
  summary: Pick<PlanSummary, "lifecycleStatus" | "optionCount"> & {
    earliestSchedDepUtc?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (summary.lifecycleStatus === "complete") return false;
  if (summary.optionCount === 0) return false;
  if (!summary.earliestSchedDepUtc) return true;
  const t = new Date(summary.earliestSchedDepUtc).getTime();
  if (!Number.isFinite(t)) return true;
  return t > now.getTime();
}

async function persistLifecycleMutations(
  client: unknown,
  userId: string,
  planId: string,
  plan: StandbyPlan,
  lifecycle: PlanLifecycleResult,
  now: Date,
): Promise<void> {
  const { setPrimaryOption, endWatch } = await import("@/lib/aircue/plan.server");
  type Db = import("@supabase/supabase-js").SupabaseClient;
  const db = client as Db;

  if (lifecycle.primaryAdvanced && lifecycle.newPrimaryOptionId) {
    await setPrimaryOption(client, userId, planId, lifecycle.newPrimaryOptionId);
  }

  if (lifecycle.status === "complete") {
    const { data: planRow } = await db
      .from("plans")
      .select("prefs,primary_option_id")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle();

    const prefs = (planRow?.prefs ?? {}) as Record<string, unknown>;
    const previousPrimary = (planRow?.primary_option_id as string | null) ?? plan.primaryOptionId;

    await db
      .from("plans")
      .update({
        prefs: {
          ...prefs,
          lifecycleStatus: "complete",
          lifecycleResolvedAt: now.toISOString(),
          ...(previousPrimary ? { lifecyclePreviousPrimaryId: previousPrimary } : {}),
        },
      })
      .eq("id", planId)
      .eq("user_id", userId);

    if (plan.watchId) {
      await endWatch(client, userId, plan.watchId);
    }
  } else if (lifecycle.primaryAdvanced) {
    const { data: planRow } = await db
      .from("plans")
      .select("prefs")
      .eq("id", planId)
      .eq("user_id", userId)
      .maybeSingle();
    const prefs = (planRow?.prefs ?? {}) as Record<string, unknown>;
    if (prefs["lifecycleStatus"] === "complete") {
      const { lifecycleStatus: _removed, lifecycleResolvedAt: _at, ...rest } = prefs;
      await db
        .from("plans")
        .update({ prefs: { ...rest, lifecycleStatus: "active" } })
        .eq("id", planId)
        .eq("user_id", userId);
    }
  }
}

/** Load → resolve → persist primary / lifecycle prefs / watch changes. */
export async function resolveAndPersistPlanLifecycle(input: {
  client: unknown;
  userId: string;
  planId: string;
  now?: Date;
}): Promise<{ plan: StandbyPlan; lifecycle: PlanLifecycleResult; persisted: boolean }> {
  const now = input.now ?? new Date();
  const { loadPlan } = await import("@/lib/aircue/plan.server");
  const loaded = await loadPlan(input.client, input.userId, input.planId);
  if (!loaded) {
    throw new Error("That plan is no longer available.");
  }

  const lifecycle = resolvePlanLifecycle(loaded, now);
  const needsPersist =
    lifecycle.primaryAdvanced ||
    lifecycle.status === "complete" ||
    (storedLifecycleStatus(loaded) === "complete" && lifecycle.status === "active");

  if (!needsPersist) {
    return { plan: applyLifecycleView(loaded, lifecycle), lifecycle, persisted: false };
  }

  if (storedLifecycleStatus(loaded) === "complete" && lifecycle.status === "complete") {
    return { plan: applyLifecycleView(loaded, lifecycle), lifecycle, persisted: false };
  }

  await persistLifecycleMutations(
    input.client,
    input.userId,
    input.planId,
    loaded,
    lifecycle,
    now,
  );

  const refreshed = await loadPlan(input.client, input.userId, input.planId);
  if (!refreshed) {
    throw new Error("That plan is no longer available.");
  }
  const resolved = resolvePlanLifecycle(refreshed, now);
  return {
    plan: applyLifecycleView(refreshed, resolved),
    lifecycle: resolved,
    persisted: true,
  };
}

/** Resolve lifecycle for Home current-plan selection; persists on candidates. */
export async function getCurrentPlanForHome(
  client: unknown,
  userId: string,
  now: Date = new Date(),
): Promise<PlanSummary | null> {
  const { loadPlanSummaries } = await import("@/lib/aircue/plan.server");
  const todayISO = localTodayISO(now);
  let summaries = await loadPlanSummaries(client, userId);

  const candidates = summaries
    .filter((p) => p.travelDate >= todayISO)
    .sort((a, b) => {
      if (a.travelDate !== b.travelDate) return a.travelDate < b.travelDate ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

  for (const candidate of candidates) {
    const { lifecycle } = await resolveAndPersistPlanLifecycle({
      client,
      userId,
      planId: candidate.id,
      now,
    });
    if (lifecycle.status === "active" && lifecycle.actionableOptionIds.length > 0) {
      summaries = await loadPlanSummaries(client, userId);
      return pickActionablePlan(summaries, todayISO);
    }
  }

  return null;
}
