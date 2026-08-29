import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarRange, GitCompareArrows } from "lucide-react";

import { PlanWatchBlock, PrimaryOptionSection } from "@/components/aircue/PlanDetailSections";
import { RouteOptionRow } from "@/components/aircue/RouteOptionRow";
import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/")({
  head: () => ({
    meta: [
      { title: "Your plan — Standbye" },
      {
        name: "description",
        content: "Your travel plan with ranked options, backup runway, and watch status.",
      },
      { property: "og:title", content: "Your plan — Standbye" },
      { property: "og:description", content: "Plan detail with options and backup runway." },
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

  const otherOptions =
    plan?.options.filter((o) =>
      plan.primaryOptionId ? o.id !== plan.primaryOptionId : o.id !== plan.preferredOptionId,
    ) ?? [];

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 pt-8 md:max-w-3xl md:px-10 md:pt-12">
      <Link
        to={plan && (plan.primaryOptionId || plan.watching) ? "/plans" : "/plan"}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />{" "}
        {plan && (plan.primaryOptionId || plan.watching) ? "Your plans" : "Home"}
      </Link>

      {isLoading && (
        <p className="mt-6 text-sm text-muted-foreground">Building your plan…</p>
      )}

      {plan && (
        <>
          <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight">
            {plan.origin} → {plan.dest}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-foreground">{longDate(plan.travelDate)}</p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {plan.travelers} traveler{plan.travelers === 1 ? "" : "s"}
          </p>

          {plan.options.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-[20px] font-semibold tracking-tight">
                {emptyTitle(plan.emptyReason)}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {emptyBody(plan.emptyReason, plan.origin, plan.dest)}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild className="h-11">
                  <Link
                    to="/escape"
                    search={{ from: plan.origin, to: plan.dest, date: plan.travelDate }}
                  >
                    Stuck right now? Widen this plan
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <Link to="/plan">Try a nearby date</Link>
                </Button>
              </div>
            </div>
          )}

          {plan.options.length > 0 && (
            <>
              <PrimaryOptionSection plan={plan} />
              <PlanWatchBlock plan={plan} />

              <StandbyeTake className="mt-5">
                {plan.noStrongSetup
                  ? "Every option carries a real tradeoff today. Compare a couple before you commit."
                  : "Standbye ranked the realistic ways to accomplish this trip. The day can still move."}
              </StandbyeTake>

              {otherOptions.length > 0 && (
                <>
                  <h2 className="mt-6 font-display text-[19px] font-semibold tracking-tight">
                    Other good options
                  </h2>
                  <ul className="mt-3 space-y-2.5">
                    {otherOptions.map((option) => (
                      <li key={option.id}>
                        <StandbyOptionRow option={option} rank={option.rank} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {plan.gateways.length > 0 && (
            <section className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[19px] font-semibold tracking-tight">
                  Ways in this plan
                </h2>
                <Link
                  to="/plans/$planId/ways"
                  params={{ planId }}
                  className="text-[14px] font-semibold text-primary"
                >
                  See every route
                </Link>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Getting to {plan.dest} today is a strategy, not one flight.
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

          {plan.options.length > 0 && (
            <Link
              to="/escape"
              search={{ from: plan.origin, to: plan.dest, date: plan.travelDate }}
              className="mt-5 flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card"
            >
              <span className="text-left">
                <span className="block text-[14px] font-semibold">Need another way? Widen this plan</span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  Unconventional but realistic ways to still get there.
                </span>
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground" />
            </Link>
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
    return `The remaining ${origin} → ${dest} departures have already gone or are too close to be worth planning around.`;
  if (reason === "carrier_filter")
    return "There are flights on this route, but none from the airlines you selected.";
  if (reason === "data_unavailable")
    return "Live flight data did not come back for this search. Try again in a few minutes.";
  return `We could not find a workable ${origin} → ${dest} routing for this date.`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
