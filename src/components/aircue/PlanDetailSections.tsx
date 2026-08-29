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

  if (!plan.watching) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="font-display text-[17px] font-semibold tracking-tight">Watch this plan</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Standbye will keep checking the day and only surface changes that could affect what you
          should do.
        </p>
        <Button className="mt-3 h-11 w-full" disabled={start.isPending} onClick={() => start.mutate()}>
          <Bell className="mr-2 h-4 w-4" />
          {start.isPending ? "Setting up…" : "Watch this plan"}
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
        Standbye is watching this plan
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Last checked {agoLabel(plan.lastCheckedAt)}
        {plan.planVerdict === "changed" ? " · Something needs another look" : " · No important changes"}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {plan.watchId && (
          <Button asChild variant="outline" className="h-10">
            <Link to="/updates/$watchId" params={{ watchId: plan.watchId }}>
              View updates <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          className="h-10"
          disabled={recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Recheck now
        </Button>
        <Button variant="outline" className="h-10" disabled={stop.isPending} onClick={() => stop.mutate()}>
          <BellOff className="mr-2 h-4 w-4" /> Stop watching
        </Button>
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
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
      <p className="mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">
        {planStatus}
      </p>

      {primary ? (
        <section className="mt-5">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">Your primary option</h2>
          <ul className="mt-2 space-y-2">
            <li>
              <StandbyOptionRow option={primary} rank={primary.rank} />
            </li>
          </ul>
          {preferred && preferred.id !== primary.id && (
            <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span className="font-semibold">Standbye now prefers {preferred.flightLabel}</span>
              <p className="mt-0.5 text-muted-foreground">{preferred.headline}</p>
              <Button
                variant="link"
                className="mt-1 h-auto p-0 text-primary"
                disabled={makePrimary.isPending}
                onClick={() => makePrimary.mutate(preferred.id)}
              >
                Make this my primary
              </Button>
            </div>
          )}
        </section>
      ) : preferred ? (
        <section className="mt-5">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">Best move right now</h2>
          <ul className="mt-2 space-y-2">
            <li>
              <StandbyOptionRow option={preferred} rank={preferred.rank} />
            </li>
          </ul>
          <Button
            variant="outline"
            className="mt-2 h-10"
            disabled={makePrimary.isPending}
            onClick={() => makePrimary.mutate(preferred.id)}
          >
            Make this my primary
          </Button>
        </section>
      ) : null}

      {plan.backupRunway.totalRealisticWays > 0 && (
        <section className="mt-5 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm font-semibold">Backup runway</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{plan.backupRunway.summary}</p>
        </section>
      )}
    </>
  );
}
