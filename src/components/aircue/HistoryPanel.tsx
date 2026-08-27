import { cn } from "@/lib/utils";
import { timeBlockShort } from "@/lib/aircue/history";
import type { HistoryPatternRow, RouteHistory } from "@/lib/aircue/history";

function pct(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

type Mood = "good" | "mixed" | "poor";

const moodFace: Record<Mood, string> = {
  good: "🙂",
  mixed: "😐",
  poor: "🙁",
};

const moodTone: Record<Mood, string> = {
  good: "text-fine",
  mixed: "text-watch",
  poor: "text-rough",
};

function Line({ mood, title, detail }: { mood: Mood; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg leading-none" aria-hidden>
        {moodFace[mood]}
      </span>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium leading-tight", moodTone[mood])}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function delayMood(rate: number): Mood {
  if (rate < 18) return "good";
  if (rate < 30) return "mixed";
  return "poor";
}

function cancelMood(rate: number): Mood {
  if (rate < 2) return "good";
  if (rate < 4) return "mixed";
  return "poor";
}

function backupMood(count: number): Mood {
  if (count >= 3) return "good";
  if (count >= 1.5) return "mixed";
  return "poor";
}

function weighted(rows: HistoryPatternRow[], pick: (r: HistoryPatternRow) => number) {
  const total = rows.reduce((sum, r) => sum + r.flightsSampled, 0);
  if (total <= 0) return null;
  return rows.reduce((sum, r) => sum + pick(r) * r.flightsSampled, 0) / total;
}

export function HistoryPanel({ history }: { history: RouteHistory }) {
  const row = history.byTimeBlock ?? history.typical;
  if (!row) return null;

  const blockName = history.timeBlock ? timeBlockShort[history.timeBlock]?.toLowerCase() : null;
  const when = blockName
    ? `${history.dowName} ${blockName}s in ${history.monthName}`
    : `${history.dowName}s in ${history.monthName}`;

  const overallDelay = weighted(history.timeBlocks, (r) => r.dep15Rate);
  let comparison: string | null = null;
  if (overallDelay !== null && history.byTimeBlock) {
    const diff = history.byTimeBlock.dep15Rate - overallDelay;
    const label = blockName ? `${blockName} departures` : "This window";
    if (Math.abs(diff) < 2) comparison = `${label} run about the same as the rest of the day`;
    else if (diff > 0)
      comparison = `${label} are ${Math.abs(diff) >= 6 ? "notably" : "slightly"} less reliable`;
    else
      comparison = `${label} are ${Math.abs(diff) >= 6 ? "notably" : "slightly"} more reliable`;
  }

  const backups = row.medianLaterBackups;

  return (
    <section className="glass glass-sheen mt-4 rounded-3xl p-5">
      <h2 className="font-display text-base font-bold tracking-tight">Your travel pattern</h2>
      <p className="mt-1 text-xs text-muted-foreground">{when}</p>

      <div className="mt-4 space-y-3.5">
        <Line
          mood={delayMood(row.dep15Rate)}
          title={
            delayMood(row.dep15Rate) === "good"
              ? "Usually reliable"
              : delayMood(row.dep15Rate) === "mixed"
                ? "Sometimes late"
                : "Often late"
          }
          detail={`${pct(row.dep15Rate)} historically delayed`}
        />
        <Line
          mood={cancelMood(row.cancelRate)}
          title={
            cancelMood(row.cancelRate) === "good"
              ? "Rarely cancelled"
              : cancelMood(row.cancelRate) === "mixed"
                ? "Occasionally cancelled"
                : "Cancelled more often"
          }
          detail={`${pct(row.cancelRate, 1)} historically cancelled`}
        />
        <Line
          mood={backupMood(backups)}
          title={
            backupMood(backups) === "good"
              ? "Good backup options"
              : backupMood(backups) === "mixed"
                ? "Limited backup options"
                : "Few backup options"
          }
          detail={`${backups.toFixed(1)} later flights on average`}
        />
      </div>

      {comparison && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Compared with this route overall
          </p>
          <p className="mt-1 text-sm">{comparison}</p>
        </div>
      )}
    </section>
  );
}
