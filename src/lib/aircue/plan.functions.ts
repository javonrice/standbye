import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
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
    carriers: string[] | null;
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
        carriers: z.array(z.string().min(2).max(3)).max(12).nullable(),
        maxStops: z.number().int().min(0).max(1).optional(),
        nearby: z.boolean().optional(),
        routingMode: z.enum(["best", "nonstop", "wide"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ planId: string; optionCount: number; reason: string | null }> => {
    const { buildPlan } = await import("@/lib/aircue/plan.server");
    return buildPlan(context.supabase, context.userId, data);
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
  }) =>
    z
      .object({
        optionId: z.string().uuid(),
        openSeats: z.number().int().min(0).max(400).nullable(),
        standbys: z.number().int().min(0).max(400).nullable(),
        cabin: z.string().min(3).max(16),
        source: z.string().min(3).max(24),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ optionId: string; judgment: string }> => {
    const { attachLoad } = await import("@/lib/aircue/plan.server");
    return attachLoad(context.supabase, context.userId, data);
  });

/* -------------------------------- watching -------------------------------- */

export const startWatchPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { optionId: string; mode: string }) =>
    z.object({ optionId: z.string().uuid(), mode: z.string().min(3).max(24) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ watchId: string }> => {
    const { beginWatch } = await import("@/lib/aircue/plan.server");
    return beginWatch(context.supabase, context.userId, data);
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
