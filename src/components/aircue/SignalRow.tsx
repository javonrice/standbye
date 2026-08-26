import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ChevronRight,
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

const dotColor: Record<BriefStatus, string> = {
  clear: "bg-fine",
  watch: "bg-primary",
  elevated: "bg-watch",
  disruption: "bg-rough",
  incomplete: "bg-muted-foreground",
};

export const confidenceLabel: Record<Confidence, string> = {
  confirmed: "Confirmed",
  strong: "Strong",
  context: "Context",
};

export function SignalRow({ signal, briefId }: { signal: Signal; briefId: string }) {
  const Icon = categoryIcon[signal.category];

  return (
    <Link
      to="/brief/$briefId/signal/$signalId"
      params={{ briefId, signalId: signal.id }}
      className="flex items-start gap-3 border-b border-border py-4 last:border-b-0"
    >
      <span className="relative mt-0.5 shrink-0">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card",
            dotColor[signal.level],
          )}
        />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold">{signal.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {confidenceLabel[signal.confidence]}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {signal.detail}
        </span>
      </span>

      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
