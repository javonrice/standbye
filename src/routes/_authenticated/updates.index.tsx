import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { EmptyState, Screen, SectionHeading } from "@/components/aircue/Layout";
import { PlanChangedTakeover } from "@/components/aircue/PlanChangedTakeover";
import { Button } from "@/components/ui/button";
import { listWatchPlans, type WatchSummary } from "@/lib/aircue/plan.functions";
import { agoLabel } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/updates/")({
  head: () => ({
    meta: [
      { title: "Updates — Standbye" },
      {
        name: "description",
        content:
          "What Standbye noticed while watching your plans — meaningful changes that may need another look.",
      },
      { property: "og:title", content: "Updates — Standbye" },
      { property: "og:description", content: "Meaningful updates on watched travel plans." },
    ],
  }),
  component: UpdatesHome,
});

function UpdatesHome() {
  const list = useServerFn(listWatchPlans);

  const { data: watches, isLoading } = useQuery({
    queryKey: ["watches"],
    queryFn: () => list(),
  });

  const active = (watches ?? []).filter((w) => w.state === "active");
  const needsAttention = active.filter((w) => w.unseenChanges > 0);
  const allQuiet = active.filter((w) => w.unseenChanges === 0);

  const [takeoverDismissed, setTakeoverDismissed] = useState(false);
  const showTakeover = needsAttention.length > 0 && !takeoverDismissed;

  return (
    <Screen>
      {showTakeover && (
        <PlanChangedTakeover watches={needsAttention} onDismiss={() => setTakeoverDismissed(true)} />
      )}
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Updates</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        What Standbye noticed while watching your plans.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && active.length === 0 && (
        <EmptyState
          className="mt-6"
          title="Nothing to watch yet"
          body="Ask Standbye to watch a plan and anything worth knowing about your day shows up here."
          action={
            <Button asChild className="h-12 rounded-2xl px-6">
              <Link to="/plan">Build a plan</Link>
            </Button>
          }
        />
      )}

      {!isLoading && active.length > 0 && needsAttention.length === 0 && (
        <QuietState watchingCount={active.length} watched={allQuiet} />
      )}

      {!isLoading && needsAttention.length > 0 && (
        <section className="mt-7">
          <SectionHeading eyebrow="Needs a look" title="Worth another look" tone="attention" />
          <ul className="mt-3 space-y-3">
            {needsAttention.map((w) => (
              <li key={w.id}>
                <MeaningfulUpdateCard watch={w} />
              </li>
            ))}
          </ul>
          {allQuiet.length > 0 && (
            <div className="mt-9">
              <SectionHeading title="Also quiet" tone="quiet" />
              <ul className="mt-1 divide-y divide-border/70">
                {allQuiet.map((w) => (
                  <QuietWatchRow key={w.id} watch={w} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </Screen>
  );
}

function QuietState({
  watchingCount,
  watched,
}: {
  watchingCount: number;
  watched: WatchSummary[];
}) {
  return (
    <div className="mt-4">
      <div className="py-12 text-center">
        <p className="font-display text-[32px] font-bold leading-none tracking-tight">All quiet</p>
        <p className="mx-auto mt-3 max-w-[32ch] text-[15px] leading-relaxed text-muted-foreground">
          Standbye is watching {watchingCount} {watchingCount === 1 ? "plan" : "plans"}. Nothing
          needs your attention right now.
        </p>
      </div>
      <div className="mt-2">
        <SectionHeading title="Watching" tone="quiet" />
        <ul className="mt-1 divide-y divide-border/70">
          {watched.map((w) => (
            <QuietWatchRow key={w.id} watch={w} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function MeaningfulUpdateCard({ watch }: { watch: WatchSummary }) {
  return (
    <div className="rounded-2xl border border-rough/40 bg-card p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rough-foreground">
        Worth another look
      </p>
      <p className="mt-1 break-words font-display text-[21px] font-bold leading-tight tracking-tight">
        {watch.origin} → {watch.dest}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {watch.latestHeadline ??
          "Something shifted on this plan. Review it before you commit your next move."}
      </p>
      {watch.primaryFlightLabel && (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Your primary {watch.primaryFlightLabel}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          to={watch.planId ? "/plans/$planId" : "/updates/$watchId"}
          params={watch.planId ? { planId: watch.planId } : { watchId: watch.id }}
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Review plan
        </Link>
        <Link
          to="/updates/$watchId"
          params={{ watchId: watch.id }}
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          View timeline
        </Link>
      </div>
    </div>
  );
}

function QuietWatchRow({ watch }: { watch: WatchSummary }) {
  return (
    <li>
      <Link
        to={watch.planId ? "/plans/$planId" : "/updates/$watchId"}
        params={watch.planId ? { planId: watch.planId } : { watchId: watch.id }}
        className="flex items-center gap-3 py-3.5 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-semibold tracking-tight">
            {watch.origin} → {watch.dest}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            No important changes · checked {agoLabel(watch.lastCheckedAt)}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
