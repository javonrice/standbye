import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import { PillarGrid } from "@/components/aircue/PillarGrid";
import type { StandbyOption } from "@/lib/aircue/standby";

export function OptionCard({ option, rank }: { option: StandbyOption; rank: number }) {
  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className="block rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Option {rank}
          </p>
          <p className="font-display text-lg font-bold tracking-tight">
            {option.kind === "connection"
              ? option.flightLabel
              : `${option.flightLabel} · ${option.origin} → ${option.dest}`}
          </p>
          <p className="text-sm text-muted-foreground">
            {option.arrLocal
              ? `${option.depLocal} – ${option.arrLocal} local`
              : `Departs ${option.depLocal} local`}
            {option.kind === "connection" ? " · one stop" : ""}
          </p>
        </div>
        <JudgmentPill judgment={option.judgment} size="sm" />
      </div>

      <p className="mt-3 text-sm text-foreground/85">{option.headline}</p>

      <div className="mt-3">
        <PillarGrid pillars={option.pillars} />
      </div>

      <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-primary">
        See the cue <ChevronRight className="h-4 w-4" />
      </p>
    </Link>
  );
}
