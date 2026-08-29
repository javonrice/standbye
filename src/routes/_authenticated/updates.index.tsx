import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { PlanChangedTakeover } from "@/components/aircue/PlanChangedTakeover";
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
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      {showTakeover && (
        <PlanChangedTakeover watches={needsAttention} onDismiss={() => setTakeoverDismissed(true)} />
      )}
      <h1 className="font-display text-2xl font-bold tracking-tight">Updates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        What Standbye noticed while watching your plans.
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && active.length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-[17px] font-semibold tracking-tight">No updates yet</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            When Standbye notices something important on a watched plan, it shows up here.
          </p>
          <Link to="/plan" className="mt-3 inline-block text-sm font-semibold text-primary">
            Build a plan
          </Link>
        </div>
      )}

      {!isLoading && active.length > 0 && needsAttention.length === 0 && (
        <QuietState watchingCount={active.length} watched={allQuiet} />
      )}

      {!isLoading && needsAttention.length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rough-foreground">
            Worth another look
          </h2>
          <ul className="mt-2 space-y-3">
            {needsAttention.map((w) => (
              <li key={w.id}>
                <MeaningfulUpdateCard watch={w} />
              </li>
            ))}
          </ul>
          {allQuiet.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Also quiet
              </h2>
              <ul className="mt-1 divide-y divide-border/70">
                {allQuiet.map((w) => (
                  <QuietWatchRow key={w.id} watch={w} />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
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
    <div className="mt-6 space-y-4">
      <div className="rounded-2xl border border-border bg-card px-4 py-6 text-center">
        <p className="font-display text-xl font-semibold tracking-tight">All quiet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Standbye is watching {watchingCount}{" "}
          {watchingCount === 1 ? "plan" : "plans"}. Nothing needs your attention right now.
        </p>
      </div>
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Watching
        </h2>
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
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="font-display text-[17px] font-semibold tracking-tight">
        {watch.origin} → {watch.dest}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {watch.latestHeadline ??
          "Something shifted on this plan. Review it before you commit your next move."}
      </p>
      {watch.primaryFlightLabel && (
        <p className="mt-1 text-xs text-muted-foreground">
          Your primary {watch.primaryFlightLabel}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {watch.planId ? (
          <Link
            to="/plans/$planId"
            params={{ planId: watch.planId }}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Review plan
          </Link>
        ) : (
          <Link
            to="/updates/$watchId"
            params={{ watchId: watch.id }}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Review plan
          </Link>
        )}
        <Link
          to="/updates/$watchId"
          params={{ watchId: watch.id }}
          className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground"
        >
          View timeline
        </Link>
      </div>
    </div>
  );
}

function QuietWatchRow({ watch }: { watch: WatchSummary }) {
  if (watch.planId) {
    return (
      <li>
        <Link
          to="/plans/$planId"
          params={{ planId: watch.planId }}
          className="flex items-center gap-3 py-3.5 transition-colors hover:bg-muted/40"
        >
          <QuietWatchBody watch={watch} />
        </Link>
      </li>
    );
  }
  return (
    <li>
      <Link
        to="/updates/$watchId"
        params={{ watchId: watch.id }}
        className="flex items-center gap-3 py-3.5 transition-colors hover:bg-muted/40"
      >
        <QuietWatchBody watch={watch} />
      </Link>
    </li>
  );
}

function QuietWatchBody({ watch }: { watch: WatchSummary }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold tracking-tight">
          {watch.origin} → {watch.dest}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          All quiet · checked {agoLabel(watch.lastCheckedAt)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );
}
