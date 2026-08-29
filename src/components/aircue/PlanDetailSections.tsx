import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, ChevronRight, RefreshCw } from "lucide-react";

import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { Button } from "@/components/ui/button";
import {
  refreshWatchPlan,
  setPrimaryOptionFn,
  startWatchPlan,
  stopWatchPlan,
} from "@/lib/aircue/plan.functions";
import { agoLabel, type StandbyPlan } from "@/lib/aircue/standby";

interface PlanWatchBlockProps {
  plan: StandbyPlan;
}

export function PlanWatchBlock({ plan }: PlanWatchBlockProps) {
  const queryClient = useQueryClient();
  const begin = useServerFn(startWatchPlan);
  const end = useServerFn(stopWatchPlan);
  const refresh = useServerFn(refreshWatchPlan);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
    queryClient.invalidateQueries({ queryKey: ["watches"] });
    queryClient.invalidateQueries({ queryKey: ["committed-plans"] });
    queryClient.invalidateQueries({ queryKey: ["recent-searches"] });
  };

  const start = useMutation({
    mutationFn: () => begin({ data: { planId: plan.id, mode: "meaningful" } }),
    onSuccess: invalidate,
  });

  const stop = useMutation({
    mutationFn: () => end({ data: { watchId: plan.watchId! } }),
    onSuccess: invalidate,
  });

  const recheck = useMutation({
    mutationFn: () => refresh({ data: { watchId: plan.watchId! } }),
    onSuccess: invalidate,
  });

  const primary =
    plan.primaryOptionId != null
      ? plan.options.find((o) => o.id === plan.primaryOptionId)
      : null;
  const primaryLabel = primary?.flightLabel ?? "your primary option";

  if (!plan.watching) {
    const hasPrimary = Boolean(plan.primaryOptionId);
    return (
      <section className="mt-7 rounded-2xl border border-primary/40 bg-primary/[0.06] p-5">
        <p className="font-display text-[21px] font-bold leading-tight tracking-tight">
          {hasPrimary ? "Keep an eye on this plan" : "Watch this plan"}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {hasPrimary
            ? `We'll watch the whole plan, not just ${primaryLabel}. If something changes enough that another option deserves your attention, we'll tell you.`
            : "Standbye will keep checking the day and only surface changes that could affect what you should do."}
        </p>
        <Button
          className="mt-4 h-13 w-full rounded-2xl text-[16px]"
          disabled={start.isPending}
          onClick={() => start.mutate()}
        >
          <Bell className="mr-2 h-4 w-4" />
          {start.isPending ? "Setting up…" : hasPrimary ? "Watch my plan" : "Watch this plan"}
        </Button>
      </section>
    );
  }

  const changed = plan.planVerdict === "changed";

  return (
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-primary">
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
        Standbye is watching
      </p>
      <p className="mt-2 font-display text-[21px] font-bold leading-tight tracking-tight">
        {changed ? "Something needs another look" : "No important changes"}
      </p>
      <p className="mt-1.5 text-[14px] text-muted-foreground">
        Last checked {agoLabel(plan.lastCheckedAt)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {plan.watchId && (
          <Link
            to="/updates/$watchId"
            params={{ watchId: plan.watchId }}
            className="inline-flex items-center text-[14px] font-semibold text-primary"
          >
            View updates <ChevronRight className="ml-0.5 h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          className="inline-flex items-center text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          disabled={recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          {recheck.isPending ? "Rechecking…" : "Recheck now"}
        </button>
        <button
          type="button"
          className="inline-flex items-center text-[14px] font-semibold text-muted-foreground hover:text-foreground"
          disabled={stop.isPending}
          onClick={() => stop.mutate()}
        >
          <BellOff className="mr-1.5 h-4 w-4" /> Stop watching
        </button>
      </div>
    </section>
  );
}

interface PrimaryOptionSectionProps {
  plan: StandbyPlan;
}

export function PrimaryOptionSection({ plan }: PrimaryOptionSectionProps) {
  const queryClient = useQueryClient();
  const setPrimary = useServerFn(setPrimaryOptionFn);

  const makePrimary = useMutation({
    mutationFn: (optionId: string) =>
      setPrimary({ data: { planId: plan.id, optionId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["committed-plans"] });
      queryClient.invalidateQueries({ queryKey: ["recent-searches"] });
    },
  });

  const preferred = plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0] ?? null;
  const primary = plan.primaryOptionId
    ? plan.options.find((o) => o.id === plan.primaryOptionId) ?? null
    : null;

  const planStatus =
    plan.planVerdict === "changed"
      ? "Worth another look"
      : plan.noStrongSetup
        ? "Plan has tradeoffs"
        : "Plan looks workable";

  return (
    <>
      <p
        className={`mt-3 flex items-center gap-2 text-[13px] font-medium ${
          plan.planVerdict === "changed" ? "text-rough-foreground" : "text-muted-foreground"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            plan.planVerdict === "changed" ? "bg-rough" : "bg-muted-foreground/50"
          }`}
          aria-hidden
        />
        {planStatus}
      </p>

      {primary ? (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Your primary option
          </p>
          <div className="mt-2">
            <StandbyOptionRow option={primary} rank={primary.rank} emphasis="primary" />
          </div>
          {preferred && preferred.id !== primary.id && (
            <div className="mt-3 px-1">
              <p className="text-[14px] font-semibold">
                Standbye currently prefers {preferred.flightLabel}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                {preferred.headline}
              </p>
              <button
                type="button"
                className="mt-1.5 text-[14px] font-semibold text-primary disabled:opacity-60"
                disabled={makePrimary.isPending}
                onClick={() => makePrimary.mutate(preferred.id)}
              >
                Make this my primary
              </button>
            </div>
          )}
        </section>
      ) : preferred ? (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Standbye's current ranking
          </p>
          <h2 className="mt-0.5 font-display text-[21px] font-bold tracking-tight">
            Best move right now
          </h2>
          <div className="mt-2.5">
            <StandbyOptionRow option={preferred} rank={preferred.rank} />
          </div>
          <Button
            variant="outline"
            className="mt-3 h-12 w-full rounded-2xl"
            disabled={makePrimary.isPending}
            onClick={() => makePrimary.mutate(preferred.id)}
          >
            Make this my primary
          </Button>
        </section>
      ) : null}

      {plan.backupRunway.totalRealisticWays > 0 && (
        <section className="mt-6 px-1">
          <p className="font-display text-[17px] font-semibold tracking-tight">Backup runway</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            {plan.backupRunway.summary}
          </p>
        </section>
      )}
    </>
  );
}
