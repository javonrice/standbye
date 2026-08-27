import { Check, CircleHelp, TriangleAlert, CircleAlert, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BriefStatus } from "@/lib/aircue/data";

const styles: Record<BriefStatus, string> = {
  clear: "bg-fine-soft text-fine-foreground",
  watch: "bg-accent text-accent-foreground",
  elevated: "bg-watch-soft text-watch-foreground",
  disruption: "bg-rough-soft text-rough-foreground",
  incomplete: "bg-muted text-muted-foreground",
};

const labels: Record<BriefStatus, string> = {
  clear: "Clear",
  watch: "Watch",
  elevated: "Elevated",
  disruption: "Active disruption",
  incomplete: "Incomplete",
};

const icons: Record<BriefStatus, React.ComponentType<{ className?: string }>> = {
  clear: Check,
  watch: TriangleAlert,
  elevated: CircleAlert,
  disruption: OctagonAlert,
  incomplete: CircleHelp,
};

export function statusLabel(status: BriefStatus) {
  return labels[status];
}

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: BriefStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const safe: BriefStatus = icons[status] ? status : "incomplete";
  const Icon = icons[safe];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide",
        size === "sm" ? "px-3 py-1 text-[0.7rem]" : "px-4 py-1.5 text-xs",
        styles[safe],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {labels[safe]}
    </span>
  );
}
