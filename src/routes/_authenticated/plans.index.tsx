import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { listCommittedPlans, type PlanSummary } from "@/lib/aircue/plan.functions";
import { type Judgment } from "@/lib/aircue/standby";

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

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <h1 className="font-display text-2xl font-bold tracking-tight">Your plans</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Trips you have a primary for, or that Standbye is watching.
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && (plans ?? []).length === 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            No plans yet. Build a search on Home, then pick a primary option or watch a plan.
          </p>
          <Link to="/plan" className="mt-3 inline-block text-sm font-semibold text-primary">
            Go to Home
          </Link>
        </div>
      )}

      {(plans ?? []).length > 0 && (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {(plans ?? []).map((p) => (
            <li key={p.id}>
              <CommittedPlanRow plan={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CommittedPlanRow({ plan: p }: { plan: PlanSummary }) {
  const watchLabel =
    p.planVerdict === "changed"
      ? "Worth another look"
      : p.watching
        ? "Watching"
        : "Not watching yet";
  const watchTone =
    p.planVerdict === "changed"
      ? "text-rough-foreground"
      : p.watching
        ? "text-primary"
        : "text-muted-foreground";
  const planStatus =
    p.planVerdict === "changed"
      ? "Worth another look"
      : p.bestJudgment === "favorable"
        ? "Plan looks workable"
        : p.bestJudgment
          ? "Plan has tradeoffs"
          : null;

  return (
    <Link
      to={p.mode === "escape" ? "/escape/$planId" : "/plans/$planId"}
      params={{ planId: p.id }}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[17px] font-semibold tracking-tight">
          {p.origin} → {p.dest}
        </span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">
          {friendlyDate(p.travelDate)}
          {p.primaryFlightLabel ? ` · Primary ${p.primaryFlightLabel}` : ""}
        </span>
        <span className={`mt-1 block text-[12px] font-medium ${watchTone}`}>
          {watchLabel}
          {p.watching && p.backupRunwaySummary ? ` · ${p.backupRunwaySummary}` : ""}
        </span>
        {planStatus && p.planVerdict !== "changed" ? (
          <span className="mt-0.5 block text-[12px] text-muted-foreground">{planStatus}</span>
        ) : null}
      </span>
      {p.bestJudgment && <CueBadge judgment={p.bestJudgment as Judgment} size="sm" />}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
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
