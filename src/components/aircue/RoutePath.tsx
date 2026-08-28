import { cn } from "@/lib/utils";

/**
 * The visual signature of Escape: origin → connecting city → destination,
 * with the intermediate station carrying the weight.
 */
export function RoutePath({
  origin,
  hub,
  dest,
  size = "md",
}: {
  origin: string;
  hub: string;
  dest: string;
  size?: "sm" | "md" | "lg";
}) {
  const end =
    size === "lg" ? "text-[20px]" : size === "sm" ? "text-[13px]" : "text-[16px]";
  const mid =
    size === "lg" ? "text-[34px]" : size === "sm" ? "text-[16px]" : "text-[24px]";

  return (
    <div className="flex items-center gap-2.5" aria-label={`${origin} via ${hub} to ${dest}`}>
      <span className={cn("font-display font-semibold tracking-tight text-muted-foreground", end)}>
        {origin}
      </span>
      <Rail />
      <span className={cn("font-display font-bold leading-none tracking-tight", mid)}>{hub}</span>
      <Rail />
      <span className={cn("font-display font-semibold tracking-tight text-muted-foreground", end)}>
        {dest}
      </span>
    </div>
  );
}

function Rail() {
  return (
    <span aria-hidden className="flex min-w-6 flex-1 items-center gap-1">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] leading-none text-muted-foreground">▸</span>
    </span>
  );
}
