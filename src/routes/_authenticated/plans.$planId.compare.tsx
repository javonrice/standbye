import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { getPlan, setPrimaryOptionFn } from "@/lib/aircue/plan.functions";
import { LocalTime } from "@/components/aircue/LocalTime";
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
          "Put two standby options side by side and see where they actually differ before you choose one.",
      },
      { property: "og:title", content: "Compare options — Standbye" },
      { property: "og:description", content: "Side-by-side comparison of two standby options." },
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

function optionLabel(option: StandbyOption): string {
  if (option.kind === "connection" && option.segments.length > 1) {
    return `Via ${option.segments[0]?.dest ?? "hub"}`;
  }
  return option.flightLabel;
}

/** One comparison row: a label plus one short cell per option. */
function buildRows(options: StandbyOption[]): Array<{ label: string; cells: Cell[] }> {
  const pillar = (o: StandbyOption, key: string) => o.pillars.find((p) => p.key === key);

  return [
    {
      label: "Overall",
      cells: options.map((o) => ({
        text: `${judgmentFace[o.judgment]} ${judgmentShort[o.judgment]}`,
      })),
    },
    { label: "Departs", cells: options.map((o) => ({ text: o.depLocal || "—", time: true })) },
    {
      label: "Arrives",
      cells: options.map((o) => ({ text: formatOptionArrival(o) || "—", time: true })),
    },
    {
      label: "Booking check",
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
      label: "Backup runway",
      cells: options.map((o) => {
        const later = o.evidence.recovery.laterNonstops.length;
        return {
          text: later > 0 ? `${later} later` : "None later",
          state: o.evidence.recovery.state,
        };
      }),
    },
    {
      label: "Standbys",
      cells: options.map((o) => {
        const n = Math.max(1, o.segments.length);
        return { text: `${n}×` };
      }),
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

  const choose = useMutation({
    mutationFn: (optionId: string) => setPrimary({ data: { planId, optionId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["plans"] }),
      ]);
      void navigate({ to: "/plans/$planId", params: { planId } });
    },
  });

  const all = plan?.options ?? [];
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  useEffect(() => {
    if (all.length === 0) return;
    setLeftId((v) => v ?? all[0]?.id ?? null);
    setRightId((v) => v ?? all[1]?.id ?? null);
  }, [all]);

  const left = all.find((o) => o.id === leftId) ?? all[0] ?? null;
  const right = all.find((o) => o.id === rightId) ?? all[1] ?? null;
  const pair = [left, right].filter((o): o is StandbyOption => Boolean(o));
  const rows = buildRows(pair);
  const preferred = all[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/plans/$planId"
        params={{ planId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Your plan
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Compare options</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {plan ? `${plan.origin} → ${plan.dest} · ${plan.travelDate}` : "Loading…"}
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Lining them up…</p>}

      {!isLoading && all.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          There is nothing to compare on this plan yet.
        </p>
      )}

      {pair.length > 0 && (
        <>
          {all.length > 2 && (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <PickerColumn
                label="Left"
                options={all}
                value={left?.id ?? ""}
                otherId={right?.id ?? ""}
                onChange={setLeftId}
              />
              <PickerColumn
                label="Right"
                options={all}
                value={right?.id ?? ""}
                otherId={left?.id ?? ""}
                onChange={setRightId}
              />
            </div>
          )}

          <div
            className="mt-4 overflow-hidden rounded-2xl border border-border bg-card"
            style={{ display: "grid", gridTemplateColumns: `5.5rem repeat(${pair.length}, 1fr)` }}
          >
            <div className="border-b border-border px-3 py-3" />
            {pair.map((o) => (
              <div key={o.id} className="border-b border-l border-border px-3 py-3">
                <p className="break-words font-display text-[15px] font-bold leading-snug tracking-tight">
                  {optionLabel(o)}
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
                    )}
                  >
                    {cell.state && (
                      <span
                        aria-hidden
                        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pillarDot[cell.state])}
                      />
                    )}
                    {cell.time ? (
                      <LocalTime value={cell.text} className="truncate" />
                    ) : (
                      <span className="truncate">{cell.text}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {preferred && (
            <p className="mt-4 text-[15px] leading-snug text-foreground">
              <span className="font-semibold">
                Standbye currently prefers {optionLabel(preferred)}.{" "}
              </span>
              {preferred.headline}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {pair.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={choose.isPending}
                onClick={() => choose.mutate(o.id)}
                className={cn(
                  "h-12 w-full rounded-xl text-[15px] font-semibold",
                  o.id === preferred?.id
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card",
                )}
              >
                Use {optionLabel(o)}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function PickerColumn({
  label,
  options,
  value,
  otherId,
  onChange,
}: {
  label: string;
  options: StandbyOption[];
  value: string;
  otherId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-border bg-card px-2 text-[14px] font-medium"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.id === otherId}>
            {optionLabel(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
