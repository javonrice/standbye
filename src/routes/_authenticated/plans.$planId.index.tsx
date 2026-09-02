import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";

import { Screen } from "@/components/aircue/Layout";
import { OptionBrief } from "@/components/aircue/OptionBrief";
import { PlanView } from "@/components/aircue/PlanView";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/")({
  head: () => ({
    meta: [
      { title: "Your plan — Standbye" },
      {
        name: "description",
        content: "Your whole standby day in one place: the move to make, backups, and changes.",
      },
      { property: "og:title", content: "Your plan — Standbye" },
      {
        property: "og:description",
        content: "Your whole standby day in one place: the move to make, backups, and changes.",
      },
    ],
  }),
  component: PlanDetailScreen,
});

function PlanDetailScreen() {
  const { planId } = Route.useParams();
  const load = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  if (isLoading) {
    return (
      <Screen width="lg">
        <p className="text-sm text-muted-foreground">Building your plan…</p>
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen width="lg">
        <p className="font-display text-lg font-semibold">That plan is gone</p>
        <Button asChild className="mt-4 h-11">
          <Link to="/plan">Back to Home</Link>
        </Button>
      </Screen>
    );
  }

  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;
  const current = selected ?? recommended;

  // No option to brief — fall back to the full plan view (zero-option state).
  if (!current) {
    return (
      <Screen width="lg">
        <Link to="/plan" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <PlanView plan={plan} />
      </Screen>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/40 pb-24">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        <Link
          to="/plan"
          aria-label="Back to Home"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <p className="flex-1 text-center text-[15px] font-semibold">
          {plan.origin} → {plan.dest}
        </p>
        <span className="h-9 w-9" />
      </header>

      <OptionBrief option={current} travelDate={plan.travelDate}>
        <div className="mt-6 space-y-3">
          <Link
            to="/plans/$planId/options"
            params={{ planId }}
            className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-[15px] font-semibold"
          >
            Other options
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          <p className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
            <Check className="h-4 w-4" /> Your current plan
          </p>
        </div>
      </OptionBrief>
    </main>
  );
}
