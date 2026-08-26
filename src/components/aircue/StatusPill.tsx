import { Check, CircleHelp, TriangleAlert, CircleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BriefStatus } from "@/lib/aircue/data";

const styles: Record<BriefStatus, string> = {
  fine: "bg-fine-soft text-fine-foreground",
  watch: "bg-watch-soft text-watch-foreground",
  rough: "bg-rough-soft text-rough-foreground",
  unknown: "bg-muted text-muted-foreground",
};

const labels: Record<BriefStatus, string> = {
  fine: "Looks fine",
  watch: "Keep an eye on it",
  rough: "Rough",
  unknown: "Not enough info",
};

const icons: Record<BriefStatus, React.ComponentType<{ className?: string }>> = {
  fine: Check,
  watch: TriangleAlert,
  rough: CircleAlert,
  unknown: CircleHelp,
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
  const Icon = icons[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm",
        styles[status],
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {labels[status]}
    </span>
  );
}
