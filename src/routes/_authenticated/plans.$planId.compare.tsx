import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import { getPlan } from "@/lib/aircue/plan.functions";
import { pillarDot, pillarTitle, type PillarKey } from "@/lib/aircue/standby";

const pillarOrder: PillarKey[] = ["availability", "operations", "history", "recovery"];

export const Route = createFileRoute("/_authenticated/plans/$planId/compare")({
  head: () => ({
    meta: [
      { title: "Compare setups — Standbye" },
      {
        name: "description",
        content:
          "Put your standby options side by side and see where they actually differ before you commit to one.",
      },
      { property: "og:title", content: "Compare setups — Standbye" },
      { property: "og:description", content: "Side-by-side comparison of your standby options." },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { planId } = Route.useParams();
  const fetchPlan = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => fetchPlan({ data: { planId } }),
  });

  const options = (plan?.options ?? []).slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-4xl md:px-10 md:pt-12">
      <Link
        to="/plans/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the list
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Compare setups</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {plan ? `${plan.origin} → ${plan.dest} · ${plan.travelDate}` : "Loading…"}
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Lining them up…</p>}

      {!isLoading && options.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          There is nothing to compare on this plan yet.
        </p>
      )}

      {options.length > 0 && (
        <div className="mt-5 space-y-5 md:space-y-0 md:overflow-x-auto">
          {/* Mobile: one card per option, pillars stacked inside */}
          <div className="space-y-4 md:hidden">
            {options.map((o, i) => (
              <section
                key={o.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Option {i + 1}
                    </p>
                    <p className="font-display text-base font-bold tracking-tight">
                      {o.flightLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{o.depLocal} local</p>
                  </div>
                  <JudgmentPill judgment={o.judgment} size="sm" />
                </div>

                <p className="mt-3 text-sm text-foreground/85">{o.headline}</p>

                <dl className="mt-3 space-y-2">
                  {pillarOrder.map((key) => {
                    const pillar = o.pillars.find((p) => p.key === key);
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-border bg-surface px-3 py-2.5"
                      >
                        <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${pillarDot[pillar?.state ?? "unknown"]}`}
                            aria-hidden
                          />
                          {pillarTitle[key]}
                        </dt>
                        <dd className="mt-0.5 text-sm font-semibold text-foreground">
                          {pillar?.label ?? "Unknown"}
                        </dd>
                        <dd className="mt-0.5 text-xs text-muted-foreground">
                          {pillar?.detail ?? "No read."}
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                <Link
                  to="/options/$optionId"
                  params={{ optionId: o.id }}
                  className="mt-3 flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  See the cue <ArrowLeft className="h-4 w-4 rotate-180" />
                </Link>
              </section>
            ))}
          </div>

          {/* Desktop: side-by-side grid */}
          <div className="hidden md:block">
            <div className="grid min-w-[520px] grid-cols-[7rem_repeat(auto-fit,minmax(9rem,1fr))] gap-x-3 gap-y-3">
              <div />
              {options.map((o) => (
                <Link
                  key={o.id}
                  to="/options/$optionId"
                  params={{ optionId: o.id }}
                  className="rounded-2xl border border-border bg-card p-3"
                >
                  <p className="font-display text-sm font-semibold">{o.flightLabel}</p>
                  <p className="text-xs text-muted-foreground">{o.depLocal} local</p>
                  <div className="mt-2">
                    <JudgmentPill judgment={o.judgment} size="sm" />
                  </div>
                </Link>
              ))}

              {pillarOrder.map((key) => (
                <PillarRow key={key} pillarKey={key} options={options} />
              ))}

              <div className="self-start pt-1 text-xs font-semibold text-muted-foreground">
                Read on it
              </div>
              {options.map((o) => (
                <p key={o.id} className="text-xs text-muted-foreground">
                  {o.headline}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PillarRow({
  pillarKey,
  options,
}: {
  pillarKey: PillarKey;
  options: NonNullable<Awaited<ReturnType<typeof getPlan>>>["options"];
}) {
  return (
    <>
      <div className="self-start pt-1 text-xs font-semibold text-muted-foreground">
        {pillarTitle[pillarKey]}
      </div>
      {options.map((o) => {
        const pillar = o.pillars.find((p) => p.key === pillarKey);
        return (
          <div key={o.id} className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span className={`h-2 w-2 rounded-full ${pillarDot[pillar?.state ?? "unknown"]}`} />
              {pillar?.label ?? "Unknown"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{pillar?.detail ?? "No read."}</p>
          </div>
        );
      })}
    </>
  );
}
