import { useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CloudSun,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { BriefStatus, Confidence, Signal, SignalCategory } from "@/lib/aircue/data";

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

const levelText: Record<BriefStatus, string> = {
  clear: "text-fine",
  watch: "text-watch",
  elevated: "text-rough",
  disruption: "text-rough",
  incomplete: "text-muted-foreground",
};

const levelBar: Record<BriefStatus, string> = {
  clear: "bg-fine",
  watch: "bg-watch",
  elevated: "bg-rough",
  disruption: "bg-rough",
  incomplete: "bg-muted-foreground",
};

const confidenceLabel: Record<Confidence, string> = {
  confirmed: "Confirmed",
  strong: "Strong signal",
  context: "Context",
};

const confidenceWeight: Record<Confidence, number> = {
  confirmed: 100,
  strong: 66,
  context: 33,
};

export function SignalRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const Icon = categoryIcon[signal.category];

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-1 py-4 text-left"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{signal.title}</span>
            <span className={cn("text-xs font-medium", levelText[signal.level])}>
              {confidenceLabel[signal.confidence]}
            </span>
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {signal.detail}
          </span>
          <span className="mt-2.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full transition-all", levelBar[signal.level])}
              style={{ width: `${confidenceWeight[signal.confidence]}%` }}
            />
          </span>
        </span>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="pb-4 pl-9 pr-1">
          <p className="text-sm leading-relaxed text-foreground/80">{signal.detail}</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            <span className="font-semibold">Why it matters: </span>
            {signal.why}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {signal.source} · updated {signal.updated}
          </p>
        </div>
      )}
    </div>
  );
}
