import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { PlanChangedTakeover } from "@/components/aircue/PlanChangedTakeover";
import { listWatchPlans, type WatchSummary } from "@/lib/aircue/plan.functions";
import { agoLabel, type Judgment } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/updates/")({
  head: () => ({
    meta: [
      { title: "Updates — Standbye" },
      {
        name: "description",
        content:
          "Plan updates from Standbye — what changed on the trips you are watching and whether anything needs another look.",
      },
      { property: "og:title", content: "Updates — Standbye" },
      { property: "og:description", content: "Updates on your watched travel plans." },
    ],
  }),
  component: UpdatesHome,
});

function WatchRow({ watch }: { watch: WatchSummary }) {
  const changed = watch.unseenChanges > 0;
  return (
    <li>
      <Link
        to="/updates/$watchId"
        params={{ watchId: watch.id }}
        className="flex items-center gap-3 py-3.5 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-display text-[17px] font-semibold tracking-tight">
              {watch.origin} → {watch.dest}
            </p>
            <span className="text-sm text-muted-foreground">{watch.travelDate}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <CueBadge judgment={watch.judgment as Judgment} size="sm" short />
            <span className="truncate text-xs text-muted-foreground">
              {changed
                ? (watch.latestHeadline ?? `Changed ${agoLabel(watch.lastCheckedAt)}`)
                : `All quiet · checked ${agoLabel(watch.lastCheckedAt)}`}
            </span>
          </div>
          {watch.primaryFlightLabel && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Primary: {watch.primaryFlightLabel}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function UpdatesHome() {
  const list = useServerFn(listWatchPlans);

  const { data: watches, isLoading } = useQuery({
    queryKey: ["watches"],
    queryFn: () => list(),
  });

  const active = (watches ?? []).filter((w) => w.state === "active");
  const ended = (watches ?? []).filter((w) => w.state !== "active");
  const needsAttention = active.filter((w) => w.unseenChanges > 0);
  const allQuiet = active.filter((w) => w.unseenChanges === 0);

  const [takeoverDismissed, setTakeoverDismissed] = useState(false);
  const showTakeover = needsAttention.length > 0 && !takeoverDismissed;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      {showTakeover && (
        <PlanChangedTakeover watches={needsAttention} onDismiss={() => setTakeoverDismissed(true)} />
      )}
      <h1 className="font-display text-2xl font-bold tracking-tight">Updates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Standbye rechecks your plans and surfaces changes that could affect what you should do.
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && active.length === 0 && ended.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Nothing to show yet. Build a plan and tap Watch this plan.
          </p>
          <Link to="/plan" className="mt-3 inline-block text-sm font-semibold text-primary">
            Build a plan
          </Link>
        </div>
      )}

      {needsAttention.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rough-foreground">
            Needs attention
          </h2>
          <ul className="mt-1 divide-y divide-border/70">
            {needsAttention.map((w) => (
              <WatchRow key={w.id} watch={w} />
            ))}
          </ul>
        </section>
      )}

      {allQuiet.length > 0 && (
        <section className={needsAttention.length > 0 ? "mt-8" : "mt-6"}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {needsAttention.length > 0 ? "All quiet" : "Plans Standbye is watching"}
          </h2>
          <ul className="mt-1 divide-y divide-border/70">
            {allQuiet.map((w) => (
              <WatchRow key={w.id} watch={w} />
            ))}
          </ul>
        </section>
      )}

      {ended.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Finished
          </h2>
          <ul className="mt-1 divide-y divide-border/70">
            {ended.map((w) => (
              <li key={w.id} className="py-3 text-sm text-muted-foreground">
                {w.origin} → {w.dest} · {w.travelDate}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
