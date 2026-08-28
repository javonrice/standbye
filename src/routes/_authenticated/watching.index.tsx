import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { PlanChangedTakeover } from "@/components/aircue/PlanChangedTakeover";
import { listWatchPlans, type WatchSummary } from "@/lib/aircue/plan.functions";
import { agoLabel, type Judgment } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/watching/")({
  head: () => ({
    meta: [
      { title: "Watching — Standbye" },
      {
        name: "description",
        content:
          "The standby setups Standbye is keeping an eye on, and whether anything has changed enough to reconsider.",
      },
      { property: "og:title", content: "Watching — Standbye" },
      { property: "og:description", content: "Your watched standby setups and what changed." },
    ],
  }),
  component: WatchingHome,
});

/** "2026-08-29" -> a friendly bucket heading, without timezone drift. */
function dayHeading(travelDate: string): string {
  const [y, m, d] = travelDate.split("-").map(Number);
  if (!y || !m || !d) return travelDate;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function groupByDay(watches: WatchSummary[]) {
  const sorted = [...watches].sort((a, b) =>
    a.travelDate === b.travelDate
      ? a.depLocal.localeCompare(b.depLocal)
      : a.travelDate.localeCompare(b.travelDate),
  );
  const groups: { key: string; heading: string; items: WatchSummary[] }[] = [];
  for (const w of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.key === w.travelDate) last.items.push(w);
    else groups.push({ key: w.travelDate, heading: dayHeading(w.travelDate), items: [w] });
  }
  return groups;
}

function WatchRow({ watch }: { watch: WatchSummary }) {
  const changed = watch.unseenChanges > 0;
  return (
    <li>
      <Link
        to="/watching/$watchId"
        params={{ watchId: watch.id }}
        className="flex items-center gap-3 py-3.5 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-display text-[17px] font-semibold tracking-tight">
              {watch.origin} → {watch.dest}
            </p>
            <span className="truncate text-sm text-muted-foreground">{watch.flightLabel}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <CueBadge judgment={watch.judgment as Judgment} size="sm" short />
            <span className="truncate text-xs text-muted-foreground">
              {changed
                ? `Changed ${agoLabel(watch.lastCheckedAt)}`
                : "No important changes"}
            </span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

function WatchingHome() {
  const list = useServerFn(listWatchPlans);

  const { data: watches, isLoading } = useQuery({
    queryKey: ["watches"],
    queryFn: () => list(),
  });

  const active = (watches ?? []).filter((w) => w.state === "active");
  const ended = (watches ?? []).filter((w) => w.state !== "active");
  const changed = active.filter((w) => w.unseenChanges > 0);
  const groups = groupByDay(active);

  const [takeoverDismissed, setTakeoverDismissed] = useState(false);
  const showTakeover = changed.length > 0 && !takeoverDismissed;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      {showTakeover && (
        <PlanChangedTakeover watches={changed} onDismiss={() => setTakeoverDismissed(true)} />
      )}
      <h1 className="font-display text-2xl font-bold tracking-tight">Watching</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Standbye rechecks these setups and tells you when something changes enough to matter.
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

      {groups.map((group) => (
        <section key={group.key} className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.heading}
          </h2>
          <ul className="mt-1 divide-y divide-border/70">
            {group.items.map((w) => (
              <WatchRow key={w.id} watch={w} />
            ))}
          </ul>
        </section>
      ))}

      {ended.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Finished
          </h2>
          <ul className="mt-1 divide-y divide-border/70">
            {ended.map((w) => (
              <li key={w.id} className="py-3 text-sm text-muted-foreground">
                {w.origin} → {w.dest} · {w.flightLabel} · {w.travelDate}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
