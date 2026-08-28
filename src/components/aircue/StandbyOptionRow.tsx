import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { pillarDot, pillarTitle, type StandbyOption } from "@/lib/aircue/standby";

/** Compact ranked standby option. One card, no cards inside it. */
export function StandbyOptionRow({ option, rank }: { option: StandbyOption; rank: number }) {
  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className="block rounded-2xl border border-border bg-card px-4 py-4 shadow-card transition-colors hover:border-primary/40"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Option {rank}
            {option.kind === "connection" ? " · one stop" : ""}
          </p>
          <p className="mt-1 truncate font-display text-[20px] font-bold tracking-tight">
            {option.kind === "connection"
              ? option.flightLabel
              : `${option.origin} → ${option.dest}`}
          </p>
          <p className="mt-0.5 text-[14px] text-muted-foreground">
            {option.kind === "connection" ? "" : `${option.flightLabel} · `}
            {option.arrLocal
              ? `${option.depLocal} – ${option.arrLocal}`
              : `Departs ${option.depLocal}`}
          </p>
        </div>
        <CueBadge judgment={option.judgment} size="sm" />
      </div>

      <p className="mt-3 text-[15px] leading-snug text-foreground/85">{option.headline}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {option.pillars.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${pillarDot[p.state]}`} aria-hidden />
            {pillarTitle[p.key]}
          </span>
        ))}
      </div>

      <p className="mt-3 flex items-center gap-1 text-[14px] font-semibold text-primary">
        See why <ChevronRight className="h-4 w-4" />
      </p>
    </Link>
  );
}
