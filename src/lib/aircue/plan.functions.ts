import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  GatewayOption,
  Pillar,
  ReportedLoad,
  StandbyOption,
  StandbyPlan,
} from "@/lib/aircue/standby";

export interface StandbyProfileValues {
  homeAirline: string;
  travelerType: string;
  airlineAccess: string[];
  homeAirports: string[];
  notifyMode: string;
  onboarded: boolean;
  painPoint?: string | null | undefined;
  accessMode?: string | null | undefined;
  freeDayUsed?: boolean | undefined;
  notifyOptin?: boolean | undefined;
  coachSeen?: boolean | undefined;
  /** Per-carrier access typing: home | zed | other. */
  airlineAccessMeta?: import("@/lib/aircue/travel-access").AirlineAccessMeta | undefined;
}


export interface PlanSummary {
  id: string;
  origin: string;
  dest: string;
  travelDate: string;
  travelers: number;
  bestJudgment: string | null;
  optionCount: number;
  createdAt: string;
  mode: "standby" | "escape";
  watching: boolean;
  planVerdict: string | null;
  lastCheckedAt: string | null;
  primaryFlightLabel: string | null;
  /** True when plans.primary_option_id is set (committed intent). */
  hasPrimary: boolean;
  /** Short backup runway line for list rows, when options exist. */
  backupRunwaySummary: string | null;
}

export interface WatchSummary {
  id: string;
  optionId: string;
  planId: string | null;
  flightLabel: string;
  origin: string;
  dest: string;
  travelDate: string;
  depLocal: string;
  judgment: string;
  verdict: string;
  unseenChanges: number;
  lastCheckedAt: string;
  state: string;
  /** Most recent unseen change headline, when the plan needs attention. */
  latestHeadline: string | null;
  /** Primary option flight label when set on the plan. */
  primaryFlightLabel: string | null;
}

export interface ChangeItem {
  id: string;
  occurredAt: string;
  kind: string;
  severity: string;
  headline: string;
  detail: string | null;
  seen: boolean;
}

/* ------------------------------- profile --------------------------------- */

export const getStandbyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StandbyProfileValues | null> => {
    const { loadStandbyProfile } = await import("@/lib/aircue/plan.server");
    return loadStandbyProfile(context.supabase, context.userId);
  });

export const saveStandbyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StandbyProfileValues) =>
    z
      .object({
        homeAirline: z.string().max(3),
        travelerType: z.string().min(2).max(24),
        airlineAccess: z.array(z.string().min(2).max(3)).max(20),
        homeAirports: z.array(z.string().length(3)).max(6),
        notifyMode: z.string().min(3).max(24),
        onboarded: z.boolean(),
        painPoint: z.string().max(32).nullable().optional(),
        accessMode: z.string().max(16).nullable().optional(),
        freeDayUsed: z.boolean().optional(),
        notifyOptin: z.boolean().optional(),
        coachSeen: z.boolean().optional(),
        airlineAccessMeta: z
          .record(z.object({ type: z.enum(["home", "zed", "other"]) }))
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<StandbyProfileValues> => {
    const { persistStandbyProfile } = await import("@/lib/aircue/plan.server");
    return persistStandbyProfile(context.supabase, context.userId, data);
  });

/* --------------------------------- plans --------------------------------- */

export const createPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    origin: string;
    dest: string;
    travelDate: string;
    travelers: number;
    cabin: string;
    /** Preference subset of Travel Access; omit/empty = all saved access. Never expands eligibility. */
    carriers?: string[] | null;
    maxStops?: number;
    nearby?: boolean;
    routingMode?: string;
  }) =>
    z
      .object({
        origin: z.string().length(3),
        dest: z.string().length(3),
        travelDate: z.string().min(10).max(10),
        travelers: z.number().int().min(1).max(9),
        cabin: z.string().min(3).max(16),
        carriers: z.array(z.string().min(2).max(3)).max(12).nullable().optional(),
        maxStops: z.number().int().min(0).max(1).optional(),
        nearby: z.boolean().optional(),
        routingMode: z.enum(["best", "nonstop", "wide"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ planId: string; optionCount: number; reason: string | null }> => {
    const { buildPlan } = await import("@/lib/aircue/plan.server");
    return buildPlan(context.supabase, context.userId, {
      ...data,
      carriers: data.carriers ?? null,
    });
  });

/* --------------------------------- escape --------------------------------- */

export const createEscapePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      origin: z.string().length(3),
      dest: z.string().length(3),
      travelDate: z.string().min(10).max(10),
      depTime: z
        .string()
        .regex(/^\d{2}:\d{2}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<{ planId: string; optionCount: number; reason: string | null }> => {
    const { buildEscapePlan, loadStandbyProfile } = await import("@/lib/aircue/plan.server");
    const { resolveTravelAccess, effectiveStaffTravelCarriers } = await import(
      "@/lib/aircue/travel-access"
    );
    const profile = await loadStandbyProfile(context.supabase, context.userId);
    const saved = resolveTravelAccess(profile ?? {});
    const carriers = effectiveStaffTravelCarriers(saved, null);
    return buildEscapePlan(context.supabase, context.userId, {
      origin: data.origin,
      dest: data.dest,
      travelDate: data.travelDate,
      travelers: 1,
      cabin: "any",
      carriers,
      ...(data.depTime ? { depTime: data.depTime } : {}),
    });
  });

export const checkEscapeVia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      planId: z.string().uuid(),
      hub: z.string().length(3),
    }),
  )
  .handler(async ({ data, context }): Promise<{ optionId: string | null; gateway: GatewayOption | null; reason: string | null }> => {
    const { checkEscapeViaAirport } = await import("@/lib/aircue/plan.server");
    return checkEscapeViaAirport(context.supabase, context.userId, data);
  });

export const getPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) =>
    z.object({ planId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<StandbyPlan | null> => {
    const { loadPlan } = await import("@/lib/aircue/plan.server");
    return loadPlan(context.supabase, context.userId, data.planId);
  });

export const listPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanSummary[]> => {
    const { loadPlanSummaries } = await import("@/lib/aircue/plan.server");
    return loadPlanSummaries(context.supabase, context.userId);
  });

/** Trips with a primary option and/or an active watch. */
export const listCommittedPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanSummary[]> => {
    const { loadCommittedPlanSummaries } = await import("@/lib/aircue/plan.server");
    return loadCommittedPlanSummaries(context.supabase, context.userId);
  });

/** Uncommitted exploration builds (no primary, no active watch). */
export const listRecentSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlanSummary[]> => {
    const { loadRecentSearchSummaries } = await import("@/lib/aircue/plan.server");
    return loadRecentSearchSummaries(context.supabase, context.userId);
  });

export const checkKnownFlight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { carrier: string; flightNumber: string; travelDate: string }) =>
    z
      .object({
        carrier: z.string().min(2).max(3),
        flightNumber: z.string().min(1).max(5),
        travelDate: z.string().min(10).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    planId: string | null;
    optionId: string | null;
    legs: Array<{ origin: string; dest: string; depLocal: string }>;
    error: string | null;
  }> => {
    const { planFromFlightNumber } = await import("@/lib/aircue/plan.server");
    return planFromFlightNumber(context.supabase, context.userId, data);
  });

/* --------------------------------- loads --------------------------------- */

export const addReportedLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    optionId: string;
    openSeats: number | null;
    standbys: number | null;
    cabin: string;
    source: string;
    partyIncluded: "yes" | "no" | "unsure" | null;
  }) =>
    z
      .object({
        optionId: z.string().uuid(),
        openSeats: z.number().int().min(0).max(400).nullable(),
        standbys: z.number().int().min(0).max(400).nullable(),
        cabin: z.string().min(3).max(16),
        source: z.string().min(3).max(24),
        partyIncluded: z.enum(["yes", "no", "unsure"]).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    optionId: string;
    judgment: string;
    reranked: boolean;
    topOptionId: string | null;
    topFlightLabel: string | null;
    previousTopOptionId: string | null;
    primaryOptionId: string | null;
  }> => {
    const { attachLoad } = await import("@/lib/aircue/plan.server");
    return attachLoad(context.supabase, context.userId, data);
  });

/* -------------------------------- watching -------------------------------- */

export const setPrimaryOptionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; optionId: string }) =>
    z.object({ planId: z.string().uuid(), optionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { setPrimaryOption } = await import("@/lib/aircue/plan.server");
    return setPrimaryOption(context.supabase, context.userId, data.planId, data.optionId);
  });

export const startWatchPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId?: string; optionId?: string; mode: string }) =>
    z
      .object({
        planId: z.string().uuid().optional(),
        optionId: z.string().uuid().optional(),
        mode: z.string().min(3).max(24),
      })
      .refine((v) => Boolean(v.planId || v.optionId), {
        message: "planId or optionId required",
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ watchId: string }> => {
    const { beginWatch } = await import("@/lib/aircue/plan.server");
    const input: { planId?: string; optionId?: string; mode: string } = { mode: data.mode };
    if (data.planId) input.planId = data.planId;
    if (data.optionId) input.optionId = data.optionId;
    return beginWatch(context.supabase, context.userId, input);
  });

export const listWatchPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WatchSummary[]> => {
    const { loadWatches } = await import("@/lib/aircue/plan.server");
    return loadWatches(context.supabase, context.userId);
  });

export const stopWatchPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { watchId: string }) =>
    z.object({ watchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { endWatch } = await import("@/lib/aircue/plan.server");
    return endWatch(context.supabase, context.userId, data.watchId);
  });

export const getWatchTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { watchId: string }) =>
    z.object({ watchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{
    watch: WatchSummary | null;
    option: StandbyOption | null;
    changes: ChangeItem[];
  }> => {
    const { loadWatchTimeline } = await import("@/lib/aircue/plan.server");
    return loadWatchTimeline(context.supabase, context.userId, data.watchId);
  });

export const markChangesSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { watchId: string }) =>
    z.object({ watchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { seenWatch } = await import("@/lib/aircue/plan.server");
    return seenWatch(context.supabase, context.userId, data.watchId);
  });

export const refreshWatchPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { watchId: string }) =>
    z.object({ watchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ changed: boolean }> => {
    const { recheckWatch } = await import("@/lib/aircue/plan.server");
    return recheckWatch(context.supabase, context.userId, data.watchId);
  });

export type { StandbyOption, StandbyPlan, ReportedLoad, Pillar };
