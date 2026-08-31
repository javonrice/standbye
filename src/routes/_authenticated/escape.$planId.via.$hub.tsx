import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { EscapeTimeline } from "@/components/aircue/EscapeTimeline";
import { RoutePath } from "@/components/aircue/RoutePath";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/aircue/plan.functions";
import { gatewayDot } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/escape/$planId/via/$hub")({
  head: () => ({
    meta: [
      { title: "Via this connection — Standbye" },
      {
        name: "description",
        content:
          "How one connecting standby routing actually works: both legs, the connection, and what is left behind it.",
      },
      { property: "og:title", content: "Via this connection — Standbye" },
      {
        property: "og:description",
        content: "Both legs, the connection, and what is left behind this routing.",
      },
    ],
  }),
  component: EscapeRouteDetail,
});

function EscapeRouteDetail() {
  const { planId, hub } = Route.useParams();
  const load = useServerFn(getPlan);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  const gateway = plan?.gateways.find((g) => g.hub === hub) ?? null;
  const option =
    plan?.options.find((o) => o.kind === "connection" && o.segments[0]?.dest === hub) ?? null;
  const city = gateway?.city ?? hub;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/escape/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Another way
      </Link>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading this routing…</p>}

      {plan && !gateway && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="font-display text-[20px] font-semibold tracking-tight">
            This routing is no longer on the board
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Look for another way again and Standbye will rebuild today's options.
          </p>
        </div>
      )}

      {plan && gateway && (
        <>
          <p className="mt-4 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            <span aria-hidden>{gatewayDot[gateway.state]}</span> {gateway.label}
          </p>
          <div className="mt-3">
            <RoutePath origin={plan.origin} hub={gateway.hub} dest={plan.dest} size="lg" />
          </div>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Via {city}
            {gateway.addedMinutes !== null && gateway.addedMinutes > 0
              ? ` · about ${gateway.addedMinutes} min more than nonstop`
              : ""}
          </p>

          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <EscapeTimeline
              origin={plan.origin}
              hub={gateway.hub}
              hubCity={city}
              dest={plan.dest}
              shots={gateway.inboundShots}
              onward={gateway.onwardDepartures}
            />
          </section>

          <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Why this works
            </p>
            <ul className="mt-3 space-y-1.5 text-[14px] leading-relaxed">
              <li>
                <span aria-hidden className="mr-1.5 text-primary">
                  ✓
                </span>
                {gateway.inboundShots.length} way
                {gateway.inboundShots.length === 1 ? "" : "s"} into {gateway.hub}
              </li>
              <li>
                <span aria-hidden className="mr-1.5 text-primary">
                  ✓
                </span>
                {gateway.onwardCount} onward option
                {gateway.onwardCount === 1 ? "" : "s"} to {plan.dest}
              </li>
              <li>
                <span aria-hidden className="mr-1.5 text-primary">
                  ✓
                </span>
                {gateway.hub} backup runway: {gateway.recoveryLabel.toLowerCase()}
              </li>
            </ul>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              {gateway.summary} This is a connection, so you clear standby twice — once out of{" "}
              {plan.origin} and again in {city}.
            </p>
            {gateway.caveat && (
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {gateway.caveat}
              </p>
            )}
          </section>


          <div className="mt-6 space-y-2">
            {option && (
              <Button asChild className="h-12 w-full rounded-xl text-[15px] font-semibold">
                <Link to="/options/$optionId" params={{ optionId: option.id }}>
                  Use this route
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="h-12 w-full rounded-xl">
              <Link to="/escape/$planId" params={{ planId }}>
                Back to other ways
              </Link>
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
