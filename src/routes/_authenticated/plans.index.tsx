import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { EmptyState, Screen, StatusLine } from "@/components/aircue/Layout";

import { Button } from "@/components/ui/button";
import { listCommittedPlans, type PlanSummary } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/")({
  head: () => ({
    meta: [
      { title: "Your plans — Standbye" },
      {
        name: "description",
        content:
          "Trips you are actually trying to make — with a primary option selected or Standbye watching.",
      },
      { property: "og:title", content: "Your plans — Standbye" },
      { property: "og:description", content: "Your committed standby travel plans." },
    ],
  }),
  component: PlansPage,
});

function PlansPage() {
  const list = useServerFn(listCommittedPlans);
  const { data: plans, isLoading } = useQuery({
    queryKey: ["committed-plans"],
    queryFn: () => list(),
  });

  const committed = plans ?? [];

  return (
    <Screen>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Your plans</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Trips you are actually trying to make.
      </p>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && committed.length === 0 && (
        <EmptyState
          className="mt-6"
          title="No plans yet"
          body="Choose a primary option or ask Standbye to watch a trip and it'll show up here."
          action={
            <Button asChild className="h-12 rounded-2xl px-6">
              <Link to="/plan">Build a plan</Link>
            </Button>
          }
        />
      )}

      {committed.length > 0 && (
        <ul className="mt-6 space-y-3">
          {committed.map((p) => (
            <li key={p.id}>
              <CommittedPlanCard plan={p} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

function CommittedPlanCard({ plan: p }: { plan: PlanSummary }) {
  const needsLook = p.planVerdict === "changed";
  const watchText = needsLook
    ? "Worth another look"
    : p.watching
      ? "Watching"
      : "Not watching yet";
  const tone = needsLook ? "attention" : p.watching ? "active" : "quiet";

  const health = needsLook
    ? null
    : p.bestJudgment === "favorable"
      ? "Plan looks workable"
      : p.bestJudgment
        ? "Plan has tradeoffs"
        : null;

  return (
    <Link
      to={p.mode === "escape" ? "/escape/$planId" : "/plans/$planId"}
      params={{ planId: p.id }}
      className={`block rounded-2xl border bg-card px-4 py-4 shadow-card transition-colors hover:border-primary/40 ${
        needsLook ? "border-rough/40" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-[22px] font-bold leading-tight tracking-tight">
            {p.origin} → {p.dest}
          </p>
          <p className="mt-1 text-[14px] font-medium text-muted-foreground">
            {friendlyDate(p.travelDate)}
          </p>
          {p.primaryFlightLabel ? (
            <div className="mt-2.5 flex items-center gap-2.5">
              <AirlineLogo code={carrierFromLabel(p.primaryFlightLabel)} size={30} />
              <p className="min-w-0 break-words text-[15px] font-semibold">
                {p.primaryFlightLabel}
                <span className="ml-1.5 text-[13px] font-medium text-muted-foreground">
                  Your primary
                </span>
              </p>
            </div>
          ) : null}

        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
        <StatusLine tone={tone}>{watchText}</StatusLine>
        {p.backupRunwaySummary && !needsLook ? (
          <p className="pl-[14px] text-[13px] leading-relaxed text-muted-foreground">
            {p.backupRunwaySummary}
          </p>
        ) : null}
        {health ? (
          <p className="pl-[14px] text-[13px] text-muted-foreground">{health}</p>
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
