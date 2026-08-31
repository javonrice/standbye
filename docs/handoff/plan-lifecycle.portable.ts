/**
 * Standbye Plan lifecycle — PORTABLE (no DB, no React, no this-repo imports).
 *
 * Drop into the new Rork repo as-is. Wire your Plan/Flight shapes to these types
 * (or rename fields). Call resolvePlanLifecycle() from Home / Ways / watch loops.
 *
 * Product rules:
 * - A Plan stays ACTIVE while any eligible future flight remains.
 * - When the CURRENT flight’s departure has passed, advance to the next
 *   ranked eligible future flight (do NOT re-rank).
 * - When no eligible future flights remain, the Plan is COMPLETE.
 * - COMPLETE ≠ calendar “past”. Keep travelDate; UI groups Done under Today.
 *
 * Traveler language (UI): current flight, other ways, watching, Done.
 * Never surface: primary, preferred, option, watch object, strategy.
 */

/** Backend / UI shared status. Orthogonal to calendar travelDate. */
export type PlanLifecycleStatus = "active" | "complete";

/**
 * Minimal flight shape this module needs.
 * Map from your app’s Flight / StandbyOption into this.
 */
export interface LifecycleFlight {
  id: string;
  /** Existing rank order — lower = better. Never invent a second ranking. */
  rank: number;
  /** Authoritative departure instant (ISO). Missing ⇒ never auto-promote. */
  schedDepUtc: string | null;
  /**
   * Staff-travel eligibility. Only `"ineligible"` blocks promotion.
   * Treat missing / uncertain / eligible as promotable for lifecycle purposes.
   */
  staffEligibility?: "eligible" | "ineligible" | "uncertain" | null;
}

/**
 * Minimal plan shape this module needs.
 * Map from your app’s Plan / StandbyPlan into this.
 */
export interface LifecyclePlan {
  id: string;
  /** Calendar travel day YYYY-MM-DD — never rewrite to implement Done. */
  travelDate: string;
  /** Persisted “current flight” id (was primary_option_id in legacy DB). */
  currentFlightId: string | null;
  /**
   * Rank-1 recommendation id if currentFlightId is unset.
   * Optional — falls back to lowest-rank flight in `flights`.
   */
  preferredFlightId?: string | null;
  flights: LifecycleFlight[];
  /** Last persisted lifecycle; `"complete"` short-circuits further advances. */
  lifecycleStatus?: PlanLifecycleStatus | null;
}

export interface PlanLifecycleResult {
  status: PlanLifecycleStatus;
  /** Flight Home should treat as current after resolution. */
  currentFlightId: string | null;
  /** True ⇒ caller must persist the new currentFlightId. */
  currentAdvanced: boolean;
  /** Id to write when currentAdvanced is true. */
  newCurrentFlightId: string | null;
  /** True ⇒ stop watching this Plan (complete). */
  shouldEndWatch: boolean;
  /** Ids still usable in the travel window (eligible + future dep). */
  actionableFlightIds: string[];
}

/** Strict: departed when schedDepUtc <= now. No boarding grace by default. */
const DEFAULT_GRACE_MS = 0;

function eligibilityOf(flight: LifecycleFlight): LifecycleFlight["staffEligibility"] {
  return flight.staffEligibility ?? "eligible";
}

/** True when we know the flight has left (or is at/past sched time). */
export function isFlightDeparted(
  flight: LifecycleFlight,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): boolean {
  if (!flight.schedDepUtc) return false;
  const t = new Date(flight.schedDepUtc).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime() - graceMs;
}

/**
 * Can this flight become (or remain) the traveler’s current flight?
 * Blocks: ineligible, missing sched time, already departed.
 */
export function isFlightActionable(
  flight: LifecycleFlight,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): boolean {
  if (eligibilityOf(flight) === "ineligible") return false;
  if (!flight.schedDepUtc) return false;
  return !isFlightDeparted(flight, now, graceMs);
}

/** Actionable flights sorted by existing rank ascending. */
export function actionableFlights(
  flights: LifecycleFlight[],
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): LifecycleFlight[] {
  return [...flights]
    .filter((f) => isFlightActionable(f, now, graceMs))
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Next flight to try after `afterFlightId` departs.
 * Prefer the next higher rank among actionable; else the best remaining.
 */
export function nextActionableFlight(
  flights: LifecycleFlight[],
  afterFlightId: string | null,
  now: Date,
  graceMs = DEFAULT_GRACE_MS,
): LifecycleFlight | null {
  const open = actionableFlights(flights, now, graceMs);
  if (open.length === 0) return null;
  if (!afterFlightId) return open[0] ?? null;
  const afterRank = flights.find((f) => f.id === afterFlightId)?.rank ?? -1;
  return open.find((f) => f.rank > afterRank) ?? open[0] ?? null;
}

function resolveCurrentFlightId(plan: LifecyclePlan, now: Date): string | null {
  const anchorId =
    plan.currentFlightId ??
    plan.preferredFlightId ??
    plan.flights.slice().sort((a, b) => a.rank - b.rank)[0]?.id ??
    null;

  if (!anchorId) {
    return actionableFlights(plan.flights, now)[0]?.id ?? null;
  }

  const anchor = plan.flights.find((f) => f.id === anchorId);
  if (anchor && isFlightActionable(anchor, now)) return anchorId;
  return nextActionableFlight(plan.flights, anchorId, now)?.id ?? null;
}

/**
 * PURE lifecycle decision — no I/O.
 *
 * Call this whenever you need truth:
 * - before showing Home
 * - before evaluating watch signals
 * - after building / switching current
 *
 * Persist separately (see handoff .md orchestrator pattern).
 */
export function resolvePlanLifecycle(
  plan: LifecyclePlan,
  now: Date = new Date(),
): PlanLifecycleResult {
  // Already marked Done — leave history alone.
  if (plan.lifecycleStatus === "complete") {
    return {
      status: "complete",
      currentFlightId: plan.currentFlightId,
      currentAdvanced: false,
      newCurrentFlightId: null,
      shouldEndWatch: true,
      actionableFlightIds: [],
    };
  }

  const actionableFlightIds = actionableFlights(plan.flights, now).map((f) => f.id);

  // Nothing left to try → Complete.
  if (actionableFlightIds.length === 0) {
    return {
      status: "complete",
      currentFlightId: null,
      currentAdvanced: false,
      newCurrentFlightId: null,
      shouldEndWatch: true,
      actionableFlightIds: [],
    };
  }

  const currentFlightId = resolveCurrentFlightId(plan, now);
  const persisted = plan.currentFlightId;
  const anchorId =
    persisted ??
    plan.preferredFlightId ??
    plan.flights.slice().sort((a, b) => a.rank - b.rank)[0]?.id ??
    null;
  const anchor = anchorId ? plan.flights.find((f) => f.id === anchorId) : null;
  const anchorDeparted = anchor ? isFlightDeparted(anchor, now) : false;

  // Only write when we had a persisted current that departed and a new one exists.
  const currentAdvanced =
    Boolean(persisted) &&
    Boolean(currentFlightId) &&
    currentFlightId !== persisted &&
    anchorDeparted;

  return {
    status: "active",
    currentFlightId,
    currentAdvanced,
    newCurrentFlightId: currentAdvanced ? currentFlightId : null,
    shouldEndWatch: false,
    actionableFlightIds,
  };
}

/**
 * Read-only view for display — does not mean DB was updated.
 * Home that must match persisted truth should call a write orchestrator first.
 */
export function applyLifecycleView<T extends LifecyclePlan>(
  plan: T,
  result: PlanLifecycleResult,
): T & { lifecycleStatus: PlanLifecycleStatus; isActionable: boolean } {
  const currentFlightId =
    result.status === "active" && result.currentFlightId
      ? result.currentFlightId
      : plan.currentFlightId;

  return {
    ...plan,
    currentFlightId,
    lifecycleStatus: result.status,
    isActionable: result.status === "active" && result.actionableFlightIds.length > 0,
  };
}

/** Local calendar YYYY-MM-DD (not UTC) — matches “today” on device. */
export function localTodayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Summary row shape for Home library selection. */
export interface LifecyclePlanSummary {
  id: string;
  travelDate: string;
  createdAt: string;
  lifecycleStatus: PlanLifecycleStatus;
  isActionable: boolean;
}

/**
 * Home picker among summaries that are still actionable.
 * Soonest travelDate, then newest createdAt.
 * Does NOT rewrite travelDate for completed same-day plans.
 */
export function pickActionablePlan(
  plans: LifecyclePlanSummary[],
  todayISO: string,
): LifecyclePlanSummary | null {
  const candidates = plans.filter(
    (p) =>
      p.travelDate >= todayISO &&
      p.lifecycleStatus !== "complete" &&
      p.isActionable !== false,
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    if (a.travelDate !== b.travelDate) return a.travelDate < b.travelDate ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  })[0] ?? null;
}

/**
 * Suggested write-orchestrator contract (implement in the new repo).
 *
 * Pseudocode:
 *   const plan = await loadPlan(id)           // READ ONLY
 *   const life = resolvePlanLifecycle(plan, now)
 *   if (life.currentAdvanced) await setCurrentFlight(id, life.newCurrentFlightId)
 *   if (life.status === "complete") {
 *     await saveLifecycleStatus(id, "complete")
 *     await endWatch(id)
 *   }
 *   return applyLifecycleView(await loadPlan(id), life)
 *
 * Call sites that MAY write:
 *   - Home current-plan load
 *   - Watch / monitoring recheck (BEFORE signal evaluation)
 *   - Plan activation after build
 *
 * Call sites that must NOT write:
 *   - History / Past plan detail
 *   - Generic “load plan for display” without ownership of transitions
 */
export type ResolveAndPersistPlanLifecycle = (input: {
  planId: string;
  now?: Date;
}) => Promise<{ plan: LifecyclePlan; lifecycle: PlanLifecycleResult; persisted: boolean }>;
