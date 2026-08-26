import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  CloudSun,
  Frown,
  HelpCircle,
  Meh,
  PlaneLanding,
  PlaneTakeoff,
  Radio,
  Smile,
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

const dotColor: Record<BriefStatus, string> = {
  clear: "bg-fine",
  watch: "bg-primary",
  elevated: "bg-watch",
  disruption: "bg-rough",
  incomplete: "bg-muted-foreground",
};

const moodIcon: Record<BriefStatus, React.ComponentType<{ className?: string }>> = {
  clear: Smile,
  watch: Meh,
  elevated: Frown,
  disruption: Frown,
  incomplete: HelpCircle,
};

const moodColor: Record<BriefStatus, string> = {
  clear: "text-fine",
  watch: "text-watch",
  elevated: "text-rough",
  disruption: "text-rough",
  incomplete: "text-muted-foreground",
};

export function SignalMood({ level, className }: { level: BriefStatus; className?: string }) {
  const Icon = moodIcon[level];
  return <Icon className={cn("h-4 w-4", moodColor[level], className)} />;
}

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
          <SignalMood level={signal.level} />
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {signal.detail}
        </span>
      </span>

      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
