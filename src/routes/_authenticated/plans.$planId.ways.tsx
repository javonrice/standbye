import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { GatewayCard } from "@/components/aircue/GatewayCard";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/ways")({
  head: () => ({
    meta: [
      { title: "All ways there — Standbye" },
      {
        name: "description",
        content:
          "Every realistic way to reach your destination today, including the connecting cities worth committing to.",
      },
      { property: "og:title", content: "All ways there — Standbye" },
      {
        property: "og:description",
        content: "The connecting cities that actually get you there today.",
      },
    ],
  }),
  component: AllWaysThere,
});

function AllWaysThere() {
  const { planId } = Route.useParams();
  const load = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/plans/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to options
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">All ways there</h1>
      {plan && (
        <p className="mt-1 text-sm text-muted-foreground">
          Getting to {plan.dest} is a strategy, not a single flight. These are the connecting cities
          worth committing to today.
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Looking at the network…</p>}

      {plan && plan.gateways.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No connecting city adds anything useful today. Either the nonstops are the whole story, or
          the onward flights out of every hub are already gone.
        </p>
      )}

      <div className="mt-5 space-y-3">
        {(plan?.gateways ?? []).map((gateway) => (
          <GatewayCard key={gateway.hub} gateway={gateway} detailed />
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        A connection means clearing standby twice. Standbye only recommends one when the ways onward
        genuinely make up for it.
      </p>
    </main>
  );
}
