import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { getPlan } from "@/lib/aircue/plan.functions";
import { gatewayDot, type GatewayOption, type StandbyOption } from "@/lib/aircue/standby";

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

  const nonstops = (plan?.options ?? []).filter((o) => o.kind === "nonstop");
  const connections = (plan?.options ?? []).filter((o) => o.kind === "connection");
  const gateways = plan?.gateways ?? [];

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
          Getting to {plan.dest} today is a strategy, not one flight.
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Looking at the network…</p>}

      {nonstops.length > 0 && (
        <section className="mt-6">
          <SectionHeading>Nonstop</SectionHeading>
          <div className="mt-2 space-y-2">
            {nonstops.map((o) => (
              <FlightWayRow key={o.id} option={o} />
            ))}
          </div>
        </section>
      )}

      {(connections.length > 0 || gateways.length > 0) && (
        <section className="mt-7">
          <SectionHeading>Best connections</SectionHeading>
          <div className="mt-2 space-y-2">
            {connections.map((o) => (
              <FlightWayRow key={o.id} option={o} />
            ))}
            {gateways.map((g) => (
              <GatewayWayRow key={g.hub} gateway={g} />
            ))}
          </div>
        </section>
      )}

      {plan && nonstops.length === 0 && connections.length === 0 && gateways.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing useful is left on this route today. Either the nonstops are the whole story, or the
          onward flights out of every hub are already gone.
        </p>
      )}

      <p className="mt-7 text-xs text-muted-foreground">
        A connection means clearing standby twice. Standbye only recommends one when the ways onward
        genuinely make up for it.
      </p>
    </main>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </h2>
  );
}

function FlightWayRow({ option }: { option: StandbyOption }) {
  const later = option.evidence.recovery.laterNonstops.length;
  const via =
    option.kind === "connection" && option.segments.length > 1
      ? `Via ${option.segments[0]?.dest ?? "hub"}`
      : null;

  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <CueBadge judgment={option.judgment} size="sm" short />
          <p className="break-words font-display text-[16px] font-bold leading-snug tracking-tight">
            {via ?? option.flightLabel}
          </p>
        </div>
        <p className="mt-1.5 font-display text-[17px] font-semibold tracking-tight">
          {option.depLocal}
          {option.arrLocal ? ` → ${option.arrLocal}` : ""}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {later > 0 ? `${later} later shot${later === 1 ? "" : "s"}` : "No later shots today"}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function GatewayWayRow({ gateway }: { gateway: GatewayOption }) {
  const waysIn = gateway.inboundShots.length;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-[13px] leading-none">
            {gatewayDot[gateway.state]}
          </span>
          <p className="truncate font-display text-[16px] font-bold tracking-tight">
            Via {gateway.hub}
          </p>
          <span className="truncate text-[13px] text-muted-foreground">
            {gateway.city ?? gateway.hub}
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-medium">
          {waysIn} way{waysIn === 1 ? "" : "s"} in · {gateway.onwardCount} onward
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {gateway.recoveryLabel} recovery
          {gateway.addedMinutes !== null && gateway.addedMinutes > 0
            ? ` · about ${gateway.addedMinutes} extra min in the air`
            : ""}
        </p>
      </div>
    </div>
  );
}
