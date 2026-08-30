import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { EmptyState, Screen, StatusLine } from "@/components/aircue/Layout";

import { Button } from "@/components/ui/button";
import { listPlans, type PlanSummary } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/")({
  head: () => ({
    meta: [
      { title: "Your plans — Standbye" },
      {
        name: "description",
        content: "Every trip you have planned with Standbye — today, upcoming, and past.",
      },
      { property: "og:title", content: "Your plans — Standbye" },
      {
        property: "og:description",
        content: "Every trip you have planned with Standbye — today, upcoming, and past.",
      },
    ],
  }),
  component: PlansPage,
});

type Group = "active" | "upcoming" | "past";

function groupOf(travelDate: string): Group {
  const [y, m, d] = travelDate.split("-").map(Number);
  if (!y || !m || !d) return "upcoming";
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "past";
  if (days === 0) return "active";
  return "upcoming";
}

function PlansPage() {
  const list = useServerFn(listPlans);
  const { data, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => list(),
  });

  const plans = data ?? [];
  const sections: { key: Group; title: string; plans: PlanSummary[] }[] = [
    { key: "active", title: "Today", plans: [] },
    { key: "upcoming", title: "Upcoming", plans: [] },
    { key: "past", title: "Past", plans: [] },
  ];

  for (const plan of plans) {
    const section = sections.find((s) => s.key === groupOf(plan.travelDate));
    section?.plans.push(plan);
  }
  for (const section of sections) {
    section.plans.sort((a, b) =>
      section.key === "past"
        ? b.travelDate.localeCompare(a.travelDate)
        : a.travelDate.localeCompare(b.travelDate) ||
          b.createdAt.localeCompare(a.createdAt),
    );
  }

  return (
    <Screen>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Your plans</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Every trip you have planned with Standbye.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && plans.length === 0 && (
        <EmptyState
          className="mt-6"
          title="No plans yet"
          body="Tell Standbye where you're trying to go and your plan will live here."
          action={
            <Button asChild className="h-12 rounded-2xl px-6">
              <Link to="/plan">Build a plan</Link>
            </Button>
          }
        />
      )}

      {sections
        .filter((section) => section.plans.length > 0)
        .map((section) => (
          <section key={section.key} className="mt-7">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {section.title}
            </h2>
            <ul className="mt-3 space-y-3">
              {section.plans.map((p) => (
                <li key={p.id}>
                  <PlanCard plan={p} past={section.key === "past"} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </Screen>
  );
}

function PlanCard({ plan: p, past }: { plan: PlanSummary; past: boolean }) {
  const needsLook = !past && p.planVerdict === "changed";

  const statusText = past
    ? "Trip is over"
    : needsLook
      ? "Something changed"
      : p.optionCount === 0
        ? "No useful option yet"
        : p.watching
          ? "Standbye is watching the day"
          : p.bestJudgment === "favorable"
            ? "Plan looks workable"
            : "Plan has tradeoffs";

  const tone = past ? "quiet" : needsLook ? "attention" : p.watching ? "active" : "quiet";

  return (
    <Link
      to={p.mode === "escape" ? "/escape/$planId" : "/plans/$planId"}
      params={{ planId: p.id }}
      className={`block rounded-2xl border bg-card px-4 py-4 shadow-card transition-colors hover:border-primary/40 ${
        needsLook ? "border-rough/40" : "border-border"
      } ${past ? "opacity-80" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-[22px] font-bold leading-tight tracking-tight">
            {p.origin} → {p.dest}
          </p>
          <p className="mt-1 text-[14px] font-medium text-muted-foreground">
            {friendlyDate(p.travelDate)} · {p.travelers} traveler{p.travelers === 1 ? "" : "s"}
          </p>
          {p.primaryFlightLabel ? (
            <div className="mt-2.5 flex items-center gap-2.5">
              <AirlineLogo code={carrierFromLabel(p.primaryFlightLabel)} size={30} />
              <p className="min-w-0 break-words text-[15px] font-semibold">
                {p.primaryFlightLabel}
                <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">
                  Your current plan
                </span>
              </p>
            </div>
          ) : null}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
        <StatusLine tone={tone}>{statusText}</StatusLine>
        {p.backupRunwaySummary && !needsLook && !past ? (
          <p className="pl-[14px] text-[13px] leading-relaxed text-muted-foreground">
            {p.backupRunwaySummary}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function friendlyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
