import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight, CornerUpRight, Sparkles } from "lucide-react";

import { EscapeBestCard } from "@/components/aircue/EscapeBestCard";
import { EscapeRouteRow } from "@/components/aircue/EscapeRouteRow";
import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkEscapeVia, getPlan } from "@/lib/aircue/plan.functions";
import type { GatewayOption } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/escape/$planId/")({
  head: () => ({
    meta: [
      { title: "Your escape routes — Standbye" },
      {
        name: "description",
        content:
          "Realistic ways to keep moving when the normal route is done, ranked by Standbye.",
      },
      { property: "og:title", content: "Your escape routes — Standbye" },
      {
        property: "og:description",
        content: "Realistic ways to keep moving when the normal route is done.",
      },
    ],
  }),
  component: EscapeResults,
});

function EscapeResults() {
  const { planId } = Route.useParams();
  const queryClient = useQueryClient();
  const load = useServerFn(getPlan);
  const via = useServerFn(checkEscapeVia);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  const [hub, setHub] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showNonstops, setShowNonstops] = useState(false);
  const [viaResult, setViaResult] = useState<{
    optionId: string | null;
    gateway: GatewayOption | null;
    reason: string | null;
  } | null>(null);

  const checkVia = useMutation({
    mutationFn: () => via({ data: { planId, hub: hub.toUpperCase() } }),
    onSuccess: (result) => {
      setViaResult(result);
      if (result.gateway) queryClient.invalidateQueries({ queryKey: ["plan", planId] });
    },
  });

  const gateways = plan?.gateways ?? [];
  const best = gateways[0] ?? null;
  const others = gateways.slice(1);
  const shown = showAll ? others : others.slice(0, 3);
  const nonstops = (plan?.options ?? []).filter((o) => o.kind === "nonstop");
  const bestOptionId =
    plan?.options.find((o) => o.kind === "connection" && o.segments[0]?.dest === best?.hub)?.id ??
    null;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link to="/escape" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Escape
      </Link>

      {isLoading && (
        <p className="mt-6 text-sm text-muted-foreground">Looking beyond the usual route…</p>
      )}

      {plan && (
        <>
          <h1 className="mt-3 font-display text-[30px] font-bold leading-tight tracking-tight">
            Get me from {plan.origin} → {plan.dest}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">{longDate(plan.travelDate)}</p>
          <p className="mt-3 text-[15px] font-medium text-foreground">
            {gateways.length > 0
              ? `Standbye found ${gateways.length} alternate way${gateways.length === 1 ? "" : "s"} to keep you moving.`
              : "Standbye looked well beyond the usual route."}
          </p>

          {gateways.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-[20px] font-semibold tracking-tight">
                No unconventional routing works right now
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {nonstops.length > 0
                  ? `The connecting options are out of runway — but ${nonstops.length} nonstop${nonstops.length === 1 ? "" : "s"} still ${nonstops.length === 1 ? "remains" : "remain"} below.`
                  : "The useful departures are gone or the onward legs don't connect. Tomorrow usually looks very different."}
              </p>
              {nonstops.length === 0 && (
                <Button asChild className="mt-4 h-11">
                  <Link to="/escape">Try another time</Link>
                </Button>
              )}
            </div>
          )}

          {best && (
            <section className="mt-6">
              <EscapeBestCard
                gateway={best}
                planId={planId}
                origin={plan.origin}
                dest={plan.dest}
                optionId={bestOptionId}
              />
            </section>
          )}

          {shown.length > 0 && (
            <section className="mt-8">
              <SectionHeading>Other ways</SectionHeading>
              <ul className="mt-1 divide-y divide-border">
                {shown.map((gateway) => (
                  <li key={gateway.hub}>
                    <EscapeRouteRow gateway={gateway} planId={planId} />
                  </li>
                ))}
              </ul>
              {!showAll && others.length > 3 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-3 text-[14px] font-semibold text-primary"
                >
                  Show all {gateways.length} escape routes
                </button>
              )}
            </section>
          )}

          {nonstops.length > 0 && (
            <section className="mt-9 border-t border-border pt-5">
              <p className="text-[15px] font-semibold">Still considering nonstop?</p>
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                {nonstops.length} {plan.origin} → {plan.dest} flight
                {nonstops.length === 1 ? "" : "s"} still on the board.
              </p>
              {showNonstops ? (
                <ul className="mt-3 space-y-2.5">
                  {nonstops.map((option) => (
                    <li key={option.id}>
                      <StandbyOptionRow option={option} rank={option.rank} />
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNonstops(true)}
                  className="mt-2 text-[14px] font-semibold text-primary"
                >
                  View direct flights
                </button>
              )}
            </section>
          )}

          <section className="mt-9 rounded-2xl border border-border bg-surface p-4">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Know a route Standbye missed?
            </p>
            <form
              className="mt-3 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setViaResult(null);
                checkVia.mutate();
              }}
            >
              <span className="text-[13px] font-medium text-muted-foreground">
                {plan.origin} →
              </span>
              <Input
                value={hub}
                onChange={(e) =>
                  setHub(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z]/g, "")
                      .slice(0, 3),
                  )
                }
                placeholder="OKC"
                aria-label="Connecting airport code"
                className="h-10 w-20 rounded-xl bg-card text-center font-semibold uppercase"
              />
              <span className="text-[13px] font-medium text-muted-foreground">→ {plan.dest}</span>
              <Button
                type="submit"
                variant="outline"
                disabled={hub.length !== 3 || checkVia.isPending}
                className="ml-auto h-10 rounded-xl"
              >
                {checkVia.isPending ? "Checking…" : "Check"}
              </Button>
            </form>

            {viaResult && (
              <div className="mt-3 rounded-xl border border-border bg-card px-3 py-1">
                {viaResult.gateway ? (
                  <EscapeRouteRow gateway={viaResult.gateway} planId={planId} />
                ) : (
                  <p className="py-2 text-[13px] leading-relaxed text-muted-foreground">
                    {viaResult.reason ?? "That routing does not work today."}
                  </p>
                )}
              </div>
            )}
          </section>

          <p className="mt-6 text-xs text-muted-foreground">
            <CornerUpRight className="mr-1 inline h-3.5 w-3.5" />
            Escape is part of this Standby Day — a different routing for the same problem, never a
            second one.
          </p>

          <Link
            to="/plan"
            className="mt-4 flex items-center gap-1 text-[13px] font-semibold text-primary"
          >
            Back to your plan <ChevronRight className="h-4 w-4" />
          </Link>
        </>
      )}
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
