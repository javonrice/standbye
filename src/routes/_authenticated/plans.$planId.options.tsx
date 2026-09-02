import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Screen } from "@/components/aircue/Layout";
import { PlanView } from "@/components/aircue/PlanView";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/options")({
  head: () => ({
    meta: [
      { title: "Other options — Standbye" },
      {
        name: "description",
        content:
          "Every other way this standby day can go: backups, other routes, loads and monitoring.",
      },
      { property: "og:title", content: "Other options — Standbye" },
      {
        property: "og:description",
        content: "Backups, other routes, loads and monitoring for this standby day.",
      },
    ],
  }),
  component: PlanOptionsScreen,
});

function PlanOptionsScreen() {
  const { planId } = Route.useParams();
  const load = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  return (
    <Screen width="lg">
      <Link
        to="/plans/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Your plan
      </Link>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading other options…</p>}

      {plan && <PlanView plan={plan} />}
    </Screen>
  );
}
