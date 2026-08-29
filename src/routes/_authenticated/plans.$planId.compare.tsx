import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight, Star } from "lucide-react";

import { getPlan, setPrimaryOptionFn } from "@/lib/aircue/plan.functions";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import {
  judgmentFace,
  judgmentShort,
  pillarDot,
  type PillarState,
  type StandbyOption,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans/$planId/compare")({
  head: () => ({
    meta: [
      { title: "Compare options — Standbye" },
      {
        name: "description",
        content:
          "Put your standby options side by side and see where they actually differ before you commit to one.",
      },
      { property: "og:title", content: "Compare options — Standbye" },
      { property: "og:description", content: "Side-by-side comparison of your standby options." },
    ],
  }),
  component: ComparePage,
});

interface Cell {
  text: string;
  state?: PillarState;
  /** Render as a local clock so a +1 day marker stays secondary. */
  time?: boolean;
}


/** One comparison row: a label plus one short cell per option. */
function buildRows(options: StandbyOption[]): Array<{ label: string; cells: Cell[] }> {
  const pillar = (o: StandbyOption, key: string) => o.pillars.find((p) => p.key === key);

  return [
    {
      label: "Judgment",
      cells: options.map((o) => ({ text: `${judgmentFace[o.judgment]} ${judgmentShort[o.judgment]}` })),
    },
    { label: "Depart", cells: options.map((o) => ({ text: o.depLocal || "—", time: true })) },
    {
      label: "Arrive",
      cells: options.map((o) => ({ text: formatOptionArrival(o) || "—", time: true })),
    },

    {
      label: "Clears",
      cells: options.map((o) => {
        const n = Math.max(1, o.segments.length);
        return { text: `${n} standby${n === 1 ? "" : "s"}` };
      }),
    },
    {
      label: "Availability",
      cells: options.map((o) => {
        const p = pillar(o, "availability");
        return { text: p?.label ?? "Unknown", state: p?.state };
      }),
    },
    {
      label: "Operations",
      cells: options.map((o) => {
        const p = pillar(o, "operations");
        return { text: p?.label ?? "Unknown", state: p?.state };
      }),
    },
    {
      label: "Recovery",
      cells: options.map((o) => ({
        text: o.evidence.recovery.label,
        state: o.evidence.recovery.state,
      })),
    },
    {
      label: "Later shots",
      cells: options.map((o) => ({ text: String(o.evidence.recovery.laterNonstops.length) })),
    },
    {
      label: "Complexity",
      cells: options.map((o) => ({ text: o.kind === "connection" ? "Medium" : "Low" })),
    },
  ];
}

function ComparePage() {
  const { planId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPlan = useServerFn(getPlan);
  const setPrimary = useServerFn(setPrimaryOptionFn);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => fetchPlan({ data: { planId } }),
  });

  const makePrimary = useMutation({
    mutationFn: (optionId: string) => setPrimary({ data: { planId, optionId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["committed-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-searches"] }),
      ]);
      void navigate({ to: "/plans/$planId", params: { planId } });
    },
  });

  const options = (plan?.options ?? []).slice(0, 3);
  const rows = buildRows(options);
  const pick = options[0];

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-4xl md:px-10 md:pt-12">
      <Link
        to="/plans/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the list
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Compare options</h1>
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
        <>
          <div className="-mx-5 mt-5 overflow-x-auto px-5 md:mx-0 md:px-0">
            <div
              className="min-w-max rounded-2xl border border-border bg-card"
              style={{
                display: "grid",
                gridTemplateColumns: `6.5rem repeat(${options.length}, minmax(8rem, 1fr))`,
              }}
            >
              <div className="border-b border-border px-3 py-3" />
              {options.map((o, i) => (
                <div
                  key={o.id}
                  className={cn(
                    "border-b border-l border-border px-3 py-3",
                    i === 0 && "bg-accent/40",
                  )}
                >
                  {i === 0 && (
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary">
                      Standbye pick
                    </p>
                  )}
                  <p className="mt-0.5 break-words font-display text-[15px] font-bold leading-snug tracking-tight">
                    {o.kind === "connection" && o.segments.length > 1
                      ? `Via ${o.segments[0]?.dest ?? "hub"}`
                      : o.flightLabel}
                  </p>
                </div>
              ))}

              {rows.map((row, r) => (
                <div key={row.label} className="contents">
                  <div
                    className={cn(
                      "px-3 py-2.5 text-[12px] font-semibold text-muted-foreground",
                      r < rows.length - 1 && "border-b border-border",
                    )}
                  >
                    {row.label}
                  </div>
                  {row.cells.map((cell, i) => (
                    <div
                      key={`${row.label}-${i}`}
                      className={cn(
                        "flex items-center gap-1.5 border-l border-border px-3 py-2.5 text-[14px] font-medium",
                        r < rows.length - 1 && "border-b",
                        i === 0 && "bg-accent/40",
                      )}
                    >
                      {cell.state && (
                        <span
                          aria-hidden
                          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pillarDot[cell.state])}
                        />
                      )}
                      <span className="truncate">{cell.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {pick && (
            <p className="mt-4 text-[15px] leading-snug text-foreground">
              <span className="font-semibold">Why the pick. </span>
              {pick.headline}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {options.map((o) => {
              const isPrimary = plan?.primaryOptionId === o.id;
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <Link
                    to="/options/$optionId"
                    params={{ optionId: o.id }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold">{o.flightLabel}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.depLocal} local · {judgmentShort[o.judgment]}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                  {isPrimary ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                      <Star className="h-3.5 w-3.5 fill-primary" /> Primary
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={makePrimary.isPending}
                      onClick={() => makePrimary.mutate(o.id)}
                      className="shrink-0 text-xs font-semibold text-primary"
                    >
                      Make primary
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
