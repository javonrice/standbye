import { useState } from "react";
import {
  Building2,
  ChevronDown,
  CloudSun,
  CalendarDays,
  PlaneTakeoff,
  PlaneLanding,
  Radio,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Confidence, Signal, SignalCategory } from "@/lib/aircue/data";

const categoryIcon: Record<SignalCategory, React.ComponentType<{ className?: string }>> = {
  weather: CloudSun,
  airport: Building2,
  faa: Radio,
  event: CalendarDays,
  holiday: CalendarDays,
  aircraft: PlaneLanding,
  cancellation: XCircle,
  flight: PlaneTakeoff,
};

const confidenceLabel: Record<Confidence, string> = {
  confirmed: "Confirmed",
  strong: "Strong signal",
  context: "Context",
};

const confidenceStyles: Record<Confidence, string> = {
  confirmed: "bg-destructive/10 text-destructive",
  strong: "bg-elevated-soft text-elevated-foreground",
  context: "bg-secondary text-context",
};

const iconTone: Record<Confidence, string> = {
  confirmed: "text-destructive",
  strong: "text-elevated-foreground",
  context: "text-context",
};

export function SignalRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const Icon = categoryIcon[signal.category];

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 py-3.5 text-left"
      >
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconTone[signal.confidence])} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{signal.title}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                confidenceStyles[signal.confidence],
              )}
            >
              {confidenceLabel[signal.confidence]}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{signal.detail}</span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="pb-4 pl-8 text-sm">
          <p className="text-foreground/80">
            <span className="font-medium">Why it matters: </span>
            {signal.why}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold">Timing: </dt>
              <dd className="inline">{signal.timing}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Source: </dt>
              <dd className="inline">{signal.source}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Freshness: </dt>
              <dd className="inline">{signal.retrieved}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
