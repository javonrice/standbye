import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarRange, GitCompareArrows } from "lucide-react";

import { OptionCard } from "@/components/aircue/OptionCard";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/plans/$planId/")({
  head: () => ({
    meta: [
      { title: "Your standby options — AirCue" },
      {
        name: "description",
        content:
          "The day's standby setups ranked by availability, operations, history, and recovery room.",
      },
      { property: "og:title", content: "Your standby options — AirCue" },
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
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {plan.origin} → {plan.dest}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.travelDate} · {plan.travelers} traveler{plan.travelers === 1 ? "" : "s"} ·{" "}
            {plan.options.length} option{plan.options.length === 1 ? "" : "s"}
          </p>

          {plan.options.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-lg font-semibold">No workable options today</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Nothing is left on this route for that date that AirCue can evaluate. That usually
                means the day is done, the route is thin, or your airline filter is too narrow.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild className="h-11">
                  <Link to="/plan">Try a nearby date</Link>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <Link to="/plan">Widen the airlines</Link>
                </Button>
              </div>
            </div>
          )}

          {plan.noStrongSetup && plan.options.length > 0 && (
            <div className="mt-5 rounded-2xl border border-watch/40 bg-watch-soft p-4">
              <p className="text-sm font-semibold text-watch-foreground">
                No standout setup today
              </p>
              <p className="mt-1 text-sm text-watch-foreground/85">
                Every option here carries a real tradeoff. Compare them side by side before you
                commit, or look at a nearby date.
              </p>
            </div>
          )}

          <ul className="mt-5 space-y-3">
            {plan.options.map((option) => (
              <li key={option.id}>
                <OptionCard option={option} rank={option.rank} />
              </li>
            ))}
          </ul>

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
            Public availability is a demand signal, not airline load. AirCue never predicts whether
            you will clear.
          </p>
        </>
      )}
    </main>
  );
}
