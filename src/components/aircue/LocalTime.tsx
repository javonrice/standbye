import { splitTimeOffset } from "@/lib/aircue/option-display";
import { cn } from "@/lib/utils";

/**
 * Renders a local clock label, keeping any trailing +1 / +2 day marker
 * visually secondary so it never competes with the time itself.
 */
export function LocalTime({
  value,
  className,
  offsetClassName,
}: {
  value: string | null | undefined;
  className?: string;
  offsetClassName?: string;
}) {
  const { time, offset } = splitTimeOffset(value ?? "");
  if (!time) return <span className={className}>—</span>;

  return (
    <span className={cn("whitespace-nowrap", className)}>
      {time}
      {offset && (
        <span
          className={cn(
            "ml-0.5 align-super text-[0.62em] font-semibold text-muted-foreground",
            offsetClassName,
          )}
          title={`Arrives ${offset.replace("+", "")} day later`}
        >
          {offset}
        </span>
      )}
    </span>
  );
}
