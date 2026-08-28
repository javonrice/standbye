import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BellOff, RefreshCw } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import { PlanChangedTakeover } from "@/components/aircue/PlanChangedTakeover";
import { listWatchPlans, refreshWatchPlan, stopWatchPlan } from "@/lib/aircue/plan.functions";
import { agoLabel, type Judgment } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/watching/")({
  head: () => ({
    meta: [
      { title: "Watching — AirCue" },
      {
        name: "description",
        content:
          "The standby setups AirCue is keeping an eye on, and whether anything has changed enough to reconsider.",
      },
      { property: "og:title", content: "Watching — AirCue" },
      { property: "og:description", content: "Your watched standby setups and what changed." },
    ],
  }),
  component: WatchingHome,
});

function WatchingHome() {
  const queryClient = useQueryClient();
  const list = useServerFn(listWatchPlans);
  const stop = useServerFn(stopWatchPlan);
  const refresh = useServerFn(refreshWatchPlan);

  const { data: watches, isLoading } = useQuery({
    queryKey: ["watches"],
    queryFn: () => list(),
  });

  const end = useMutation({
    mutationFn: (watchId: string) => stop({ data: { watchId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watches"] }),
  });

  const recheck = useMutation({
    mutationFn: (watchId: string) => refresh({ data: { watchId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watches"] }),
  });

  const active = (watches ?? []).filter((w) => w.state === "active");
  const ended = (watches ?? []).filter((w) => w.state !== "active");
  const changed = active.filter((w) => w.unseenChanges > 0);

  const [takeoverDismissed, setTakeoverDismissed] = useState(false);
  const showTakeover = changed.length > 0 && !takeoverDismissed;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-3xl md:px-10 md:pt-12">
      {showTakeover && (
        <PlanChangedTakeover watches={changed} onDismiss={() => setTakeoverDismissed(true)} />
      )}
      <h1 className="font-display text-2xl font-bold tracking-tight">Watching</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        AirCue rechecks these setups and tells you when something changes enough to matter.
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && active.length === 0 && ended.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Nothing on watch yet. Plan a trip, open a setup, and tap Watch this plan.
          </p>
          <Link to="/plan" className="mt-3 inline-block text-sm font-semibold text-primary">
            Plan a trip
          </Link>
        </div>
      )}

      <ul className="mt-5 space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {active.map((w) => (
          <li key={w.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-base font-semibold">
                  {w.flightLabel} · {w.origin} → {w.dest}
                </p>
                <p className="text-xs text-muted-foreground">
                  {w.travelDate} · {w.depLocal} local
                </p>
              </div>
              <JudgmentPill judgment={w.judgment as Judgment} size="sm" />
            </div>

            <p className="mt-2 text-sm text-foreground/85">{w.verdict}</p>

            <p className="mt-1 text-xs text-muted-foreground">
              Checked {agoLabel(w.lastCheckedAt)}
              {w.unseenChanges > 0
                ? ` · ${w.unseenChanges} new ${w.unseenChanges === 1 ? "update" : "updates"}`
                : ""}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <Link
                to="/watching/$watchId"
                params={{ watchId: w.id }}
                className="flex items-center gap-1 text-sm font-semibold text-primary"
              >
                What changed <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => recheck.mutate(w.id)}
                  disabled={recheck.isPending}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-4 w-4" /> Recheck
                </button>
                <button
                  type="button"
                  onClick={() => end.mutate(w.id)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <BellOff className="h-4 w-4" /> Stop
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {ended.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-base font-bold tracking-tight">Finished</h2>
          <ul className="mt-2 space-y-2">
            {ended.map((w) => (
              <li key={w.id} className="rounded-xl border border-border/60 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {w.flightLabel} · {w.origin} → {w.dest} · {w.travelDate}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
