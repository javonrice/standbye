import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import {
  pillarDot,
  pillarTitle,
  type Pillar,
  type PillarKey,
  type StandbyOption,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/** Signals worth scanning in a collapsed row. History stays on the detail screen. */
const SCAN_ORDER: PillarKey[] = ["availability", "operations", "recovery"];

function scanSignals(pillars: Pillar[]): Pillar[] {
  const picked = SCAN_ORDER.map((key) => pillars.find((p) => p.key === key)).filter(
    (p): p is Pillar => Boolean(p),
  );
  if (picked.length >= 3) return picked.slice(0, 3);
  const rest = pillars.filter((p) => !picked.includes(p));
  return [...picked, ...rest].slice(0, 3);
}

/**
 * One ranked standby setup, built to be scanned like a flight result rather than
 * read like a dashboard.
 */
export function StandbyOptionRow({ option, rank }: { option: StandbyOption; rank: number }) {
  const signals = scanSignals(option.pillars);
  const laterShots = option.evidence.recovery.laterNonstops.length;
  const isTop = rank === 1;

  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className={cn(
        "group block rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:border-primary/40",
        isTop ? "border-primary/35 shadow-card" : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold",
            isTop ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {rank}
        </span>
        <CueBadge judgment={option.judgment} size="sm" short />
        {option.kind === "connection" && (
          <span className="text-[12px] font-medium text-muted-foreground">One stop</span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-bold tracking-tight">
            {option.flightLabel}
          </p>
          <p className="mt-1 truncate font-display text-[20px] font-semibold tracking-tight">
            {option.depLocal}
            {option.arrLocal ? ` → ${option.arrLocal}` : ""}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {option.origin} &nbsp;·&nbsp; {option.dest}
            {laterShots > 0 ? ` · ${laterShots} later shot${laterShots === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>

      <dl className="mt-3 space-y-1 border-t border-border/70 pt-2.5">
        {signals.map((p) => (
          <div key={p.key} className="flex items-center gap-2 text-[13px]">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pillarDot[p.state])} aria-hidden />
            <dt className="w-24 shrink-0 text-muted-foreground">{pillarTitle[p.key]}</dt>
            <dd className="min-w-0 truncate font-medium text-foreground">{p.label}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}
