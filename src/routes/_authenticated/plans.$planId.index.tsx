import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Screen } from "@/components/aircue/Layout";
import { PlanView } from "@/components/aircue/PlanView";
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

  return (
    <Screen width="lg">
      <Link to="/plan" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Building your plan…</p>}

      {plan && <PlanView plan={plan} />}
    </Screen>
  );
}
