import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarRange, GitCompareArrows } from "lucide-react";

import { RouteOptionRow } from "@/components/aircue/RouteOptionRow";
import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/")({
  head: () => ({
    meta: [
      { title: "Your standby options — Standbye" },
      {
        name: "description",
        content:
          "The day's standby setups ranked by availability, operations, history, and recovery room.",
      },
      { property: "og:title", content: "Your standby options — Standbye" },
      { property: "og:description", content: "Ranked standby setups for this route and date." },
    ],
  }),
  component: OptionsScreen,
});

function OptionsScreen() {
  const { planId } = Route.useParams();
  const load = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 pt-8 md:max-w-3xl md:px-10 md:pt-12">
      <Link to="/plan" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> New plan
      </Link>

      {isLoading && (
        <p className="mt-6 text-sm text-muted-foreground">Ranking today's standby setups…</p>
      )}

      {plan && (
        <>
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight">
            {plan.origin} → {plan.dest}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-foreground">
            {longDate(plan.travelDate)}
          </p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {plan.travelers} traveler{plan.travelers === 1 ? "" : "s"}
          </p>

          {plan.options.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-[20px] font-semibold tracking-tight">{emptyTitle(plan.emptyReason)}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {emptyBody(plan.emptyReason, plan.origin, plan.dest)}
              </p>
              {plan.scannedAirports.origins.length + plan.scannedAirports.dests.length > 2 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  We looked at {plan.scannedAirports.origins.join(", ")} out and{" "}
                  {plan.scannedAirports.dests.join(", ")} in.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild className="h-11">
                  <Link to="/plan">Try a nearby date</Link>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <Link to="/plan">Change airports or airlines</Link>
                </Button>
              </div>
            </div>
          )}

          {plan.options.length > 0 && (
            <StandbyeTake className="mt-5">
              {plan.noStrongSetup
                ? "Nothing stands out today. Every option carries a real tradeoff, so compare a couple before you commit."
                : "Option 1 is the cleanest shot we found. The rest are here in case the day moves."}
            </StandbyeTake>
          )}

          {plan.options.length > 0 && (
            <h2 className="mt-6 font-display text-[19px] font-semibold tracking-tight">
              Best standby setups
            </h2>
          )}

          <ul className="mt-3 space-y-2.5">
            {plan.options.map((option) => (
              <li key={option.id}>
                <StandbyOptionRow option={option} rank={option.rank} />
              </li>
            ))}
          </ul>

          {plan.gateways.length > 0 && (
            <section className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[19px] font-semibold tracking-tight">All ways there</h2>
                <Link
                  to="/plans/$planId/ways"
                  params={{ planId }}
                  className="text-[14px] font-semibold text-primary"
                >
                  See every route
                </Link>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Connecting cities that would genuinely move you toward {plan.dest} today.
              </p>
              <div className="mt-3 space-y-3">
                {plan.gateways.slice(0, 3).map((gateway) => (
                  <RouteOptionRow key={gateway.hub} gateway={gateway} />
                ))}
              </div>
            </section>
          )}

          {plan.options.length > 1 && (
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-11">
                <Link to="/plans/$planId/compare" params={{ planId }}>
                  <GitCompareArrows className="mr-2 h-4 w-4" /> Compare options
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11">
                <Link to="/plan">
                  <CalendarRange className="mr-2 h-4 w-4" /> Try another date
                </Link>
              </Button>
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Public availability is a demand signal, not airline load. Standbye never predicts whether
            you will clear.
          </p>
        </>
      )}
    </main>
  );
}

type EmptyReason = "no_service" | "day_over" | "carrier_filter" | "data_unavailable" | null;

function emptyTitle(reason: EmptyReason): string {
  if (reason === "day_over") return "The useful part of this day is behind you";
  if (reason === "carrier_filter") return "Your airline filter is too narrow";
  if (reason === "data_unavailable") return "We could not check flights right now";
  return "No one flies this nonstop today";
}

function emptyBody(reason: EmptyReason, origin: string, dest: string): string {
  if (reason === "day_over")
    return `The remaining ${origin} → ${dest} departures have already gone or are too close to be worth planning around. Tomorrow usually looks very different.`;
  if (reason === "carrier_filter")
    return `There are flights on this route, but none from the airlines you selected. Widen the airlines and we can look again.`;
  if (reason === "data_unavailable")
    return `Live flight data did not come back for this search, so we would rather show you nothing than guess. Try again in a few minutes.`;
  return `We could not find a workable ${origin} → ${dest} routing for this date — not even through a connection. Smaller cities often need a nearby airport instead.`;
}
