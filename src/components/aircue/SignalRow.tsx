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
import type { BriefStatus, Signal, SignalCategory } from "@/lib/aircue/data";

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

const levelPill: Record<BriefStatus, string> = {
  fine: "bg-fine-soft text-fine-foreground",
  watch: "bg-watch-soft text-watch-foreground",
  rough: "bg-rough-soft text-rough-foreground",
  unknown: "bg-muted text-muted-foreground",
};

export function SignalRow({ signal }: { signal: Signal }) {
  const [open, setOpen] = useState(false);
  const Icon = categoryIcon[signal.category];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-full py-2.5 pl-3 pr-3.5 text-left transition-colors",
          levelPill[signal.level],
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm font-semibold">{signal.title}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      <p className="mt-1.5 px-3 text-sm text-muted-foreground">{signal.detail}</p>

      {open && (
        <p className="mt-2 rounded-lg bg-muted/60 px-3.5 py-3 text-sm leading-relaxed text-foreground/85">
          {signal.why}
        </p>
      )}
    </div>
  );
}
