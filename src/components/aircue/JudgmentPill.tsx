import { judgmentFace, judgmentTitle, judgmentTone, type Judgment } from "@/lib/aircue/standby";

export function JudgmentPill({
  judgment,
  size = "md",
}: {
  judgment: Judgment;
  size?: "sm" | "md" | "lg";
}) {
  const tone = judgmentTone[judgment];
  const scale =
    size === "lg"
      ? "px-4 py-2 text-base"
      : size === "sm"
        ? "px-2.5 py-1 text-xs"
        : "px-3 py-1.5 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-semibold ring-1 ${tone.bg} ${tone.text} ${tone.ring} ${scale}`}
    >
      <span aria-hidden>{judgmentFace[judgment]}</span>
      {judgmentTitle[judgment]}
    </span>
  );
}
