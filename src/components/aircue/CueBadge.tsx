import {
  judgmentFace,
  judgmentShort,
  judgmentTitle,
  judgmentTone,
  type Judgment,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/**
 * The single judgment chip used everywhere. Status colour only ever appears as
 * a tinted pill — never as a full-card wash.
 */
export function CueBadge({
  judgment,
  size = "md",
  short = false,
  className,
}: {
  judgment: Judgment;
  size?: "sm" | "md" | "lg";
  /** Use the one-word label for dense lists. */
  short?: boolean;
  className?: string;
}) {
  const tone = judgmentTone[judgment];
  const scale =
    size === "lg"
      ? "h-9 px-3.5 text-[15px]"
      : size === "sm"
        ? "h-7 px-2.5 text-[12px]"
        : "h-8 px-3 text-[13px]";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold",
        tone.bg,
        tone.text,
        scale,
        className,
      )}
    >
      <span aria-hidden className="text-[1.05em] leading-none">
        {judgmentFace[judgment]}
      </span>
      {judgmentTitle[judgment]}
    </span>
  );
}
