import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronDown, ChevronRight, CornerUpRight, Sparkles } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { PillarGrid } from "@/components/aircue/PillarGrid";
import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkEscapeVia, getPlan } from "@/lib/aircue/plan.functions";
import { gatewayDot, type GatewayOption, type StandbyOption } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/escape/$planId")({
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

  const connections = (plan?.options ?? []).filter((o) => o.kind === "connection");
  const nonstops = (plan?.options ?? []).filter((o) => o.kind === "nonstop");
  const best = connections[0] ?? null;
  const rest = best ? connections.slice(1) : [];
  const gateways = (plan?.gateways ?? []).filter(
    (g) => !connections.some((o) => o.segments[0]?.dest === g.hub),
  );

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
            Escape to {plan.dest}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            From {plan.origin} · {longDate(plan.travelDate)}
          </p>
          <p className="mt-3 text-[15px] font-medium text-foreground">
            {plan.options.length + plan.gateways.length > 0
              ? `Standbye found ${plan.options.length + plan.gateways.length} realistic way${plan.options.length + plan.gateways.length === 1 ? "" : "s"} to keep moving.`
              : "Standbye looked well beyond the usual route."}
          </p>

          {plan.options.length === 0 && plan.gateways.length === 0 && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5">
              <p className="font-display text-[20px] font-semibold tracking-tight">
                Nothing realistic is moving today
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Even the unconventional routings are out of runway — the useful departures are
                gone or the onward legs don't connect. Tomorrow usually looks very different.
              </p>
              <Button asChild className="mt-4 h-11">
                <Link to="/escape">Try another time</Link>
              </Button>
            </div>
          )}

          {nonstops.length > 0 && (
            <section className="mt-6">
              <SectionHeading>Still nonstop</SectionHeading>
              <ul className="mt-2 space-y-2.5">
                {nonstops.map((option) => (
                  <li key={option.id}>
                    <StandbyOptionRow option={option} rank={option.rank} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {best && (
            <section className="mt-6">
              <SectionHeading>Best escape</SectionHeading>
              <div className="mt-2 rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-center gap-2">
                  <CueBadge judgment={best.judgment} size="sm" />
                </div>
                <p className="mt-3 break-words font-display text-[22px] font-bold leading-tight tracking-tight">
                  {best.flightLabel}
                </p>
                <p className="mt-1 text-[14px] text-muted-foreground">
                  {best.depLocal}
                  {best.arrLocal ? ` → ${best.arrLocal}` : ""} · {best.headline}
                </p>

                <div className="mt-4">
                  <PillarGrid pillars={best.pillars} />
                </div>

                <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                  Not a typical connection — just a useful way there today. A connection means
                  clearing standby twice.
                </p>

                <Button asChild className="mt-4 h-12 w-full rounded-xl text-[15px] font-semibold">
                  <Link to="/options/$optionId" params={{ optionId: best.id }}>
                    Use this escape
                  </Link>
                </Button>
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="mt-7">
              <SectionHeading>Other escapes</SectionHeading>
              <ul className="mt-2 space-y-2.5">
                {rest.map((option) => (
                  <li key={option.id}>
                    <StandbyOptionRow option={option} rank={option.rank} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {gateways.length > 0 && (
            <section className="mt-7">
              <SectionHeading>Worth a look</SectionHeading>
              <div className="mt-2 space-y-3">
                {gateways.map((gateway) => (
                  <EscapeGatewayRow key={gateway.hub} gateway={gateway} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8 rounded-2xl border border-border bg-surface p-4">
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
                onChange={(e) => setHub(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
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
              <div className="mt-3 rounded-xl border border-border bg-card p-3.5">
                {viaResult.gateway ? (
                  <>
                    <EscapeGatewayRow gateway={viaResult.gateway} />
                    <Link
                      to={viaResult.optionId ? "/options/$optionId" : "/escape/$planId"}
                      params={viaResult.optionId ? { optionId: viaResult.optionId } : { planId }}
                      className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-primary"
                    >
                      See this escape <ChevronRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {viaResult.reason ?? "That routing does not work today."}
                  </p>
                )}
              </div>
            )}
          </section>

          <p className="mt-6 text-xs text-muted-foreground">
            <CornerUpRight className="mr-1 inline h-3.5 w-3.5" />
            Escape is part of this Standby Day — a different routing for the same problem, never
            a second one.
          </p>
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

function EscapeGatewayRow({ gateway }: { gateway: GatewayOption }) {
  const [open, setOpen] = useState(false);
  const waysIn = gateway.inboundShots.length;
  const contentId = `gateway-${gateway.hub}`;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
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
          <p className="mt-1 text-[13px] text-muted-foreground">
            {waysIn} way{waysIn === 1 ? "" : "s"} in · {gateway.onwardCount} onward
            {gateway.addedMinutes !== null && gateway.addedMinutes > 0
              ? ` · about ${gateway.addedMinutes} extra min in the air`
              : ""}
          </p>
          {gateway.caveat && (
            <p className="mt-1 text-[12px] text-muted-foreground">{gateway.caveat}</p>
          )}
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div id={contentId} className="border-t border-border px-4 py-3.5">
          <p className="text-[13px] leading-relaxed text-foreground">{gateway.summary}</p>

          <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Ways into {gateway.hub}
          </p>
          {waysIn > 0 ? (
            <ul className="mt-1.5 space-y-1.5">
              {gateway.inboundShots.map((shot) => (
                <li
                  key={`${shot.flightLabel}-${shot.depLocal}`}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="min-w-0 break-words text-[14px] font-medium">
                    {shot.flightLabel}
                  </span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {shot.depLocal}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              No useful departures left into {gateway.hub} today.
            </p>
          )}

          <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Onward to your destination
          </p>
          {gateway.onwardDepartures.length > 0 ? (
            <p className="mt-1.5 text-[14px]">{gateway.onwardDepartures.join(" · ")}</p>
          ) : (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Onward legs aren't confirmed for today.
            </p>
          )}

          <p className="mt-3 text-[13px] text-muted-foreground">
            If it doesn't work: {gateway.recoveryLabel}
          </p>
          <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
            A connection means clearing standby twice — once out of here, once out of{" "}
            {gateway.hub}.
          </p>
        </div>
      )}
    </div>
  );
}


/** "2026-08-29" -> "Saturday, Aug 29" without shifting into another timezone. */
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
