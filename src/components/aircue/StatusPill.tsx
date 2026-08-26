import { cn } from "@/lib/utils";
import type { BriefStatus } from "@/lib/aircue/data";

const styles: Record<BriefStatus, string> = {
  clear: "bg-clear text-clear-foreground",
  watch: "bg-secondary text-secondary-foreground",
  elevated: "bg-elevated text-elevated-foreground",
  disruption: "bg-destructive text-destructive-foreground",
  incomplete: "bg-muted text-muted-foreground",
};

const labels: Record<BriefStatus, string> = {
  clear: "Clear",
  watch: "Watch",
  elevated: "Elevated",
  disruption: "Active disruption",
  incomplete: "Incomplete",
};

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: BriefStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold uppercase tracking-wide",
        size === "sm" ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-xs",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}
