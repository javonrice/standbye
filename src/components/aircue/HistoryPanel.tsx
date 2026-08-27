import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { airlineName } from "@/lib/aircue/airlines";
import { timeBlockRange, timeBlockShort } from "@/lib/aircue/history";
import type { HistoryLoadRow, HistoryPatternRow, RouteHistory } from "@/lib/aircue/history";

function pct(value: number) {
  return `${Math.round(value)}%`;
}

function seats(value: number) {
  return String(Math.round(value));
}

function seatTone(empty: number) {
  if (empty >= 15) return "bg-fine";
  if (empty >= 6) return "bg-watch";
  return "bg-rough";
}

function lateTone(rate: number) {
  if (rate < 18) return "bg-fine";
  if (rate < 30) return "bg-watch";
  return "bg-rough";
}

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const width = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-3 py-3 text-center">
      <p className="font-display text-xl font-bold leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-[0.7rem] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function SeatTrend({ title, rows }: { title: string; rows: HistoryLoadRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.avgEmptySeats), 5);

  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
            <Bar value={row.avgEmptySeats} max={max} tone={seatTone(row.avgEmptySeats)} />
            <span className="w-24 shrink-0 text-right text-xs text-foreground/80">
              ~{seats(row.avgEmptySeats)} empty · {Math.round(row.loadFactor)}% sold
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeOfDay({ rows, activeBlock }: { rows: HistoryPatternRow[]; activeBlock: string | null }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.dep15Rate), 10);

  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        By time of day
      </p>
      <div className="mt-2.5 space-y-2.5">
        {rows.map((row) => {
          const active = row.block === activeBlock;
          return (
            <div
              key={row.label}
              className={cn(
                "rounded-2xl px-3 py-2.5",
                active ? "bg-white/10 ring-1 ring-white/15" : "bg-white/[0.03]",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">
                  {row.label}
                  {active && <span className="ml-2 text-[0.7rem] text-primary">your flight</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeBlockRange[row.block ?? ""] ?? ""}
                </span>
              </div>
              <div className="mt-2">
                <Bar value={row.dep15Rate} max={max} tone={lateTone(row.dep15Rate)} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {pct(row.dep15Rate)} left late · {pct(row.cancelRate)} cancelled ·{" "}
                {row.medianLaterBackups} later flight{row.medianLaterBackups === 1 ? "" : "s"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HistoryPanel({ history }: { history: RouteHistory }) {
  const [open, setOpen] = useState(false);
  const seatsInfo = history.loadTypical;
  const reliability = history.byTimeBlock ?? history.typical;
  const blockName = history.timeBlock ? timeBlockShort[history.timeBlock] : null;

  return (
    <section className="glass glass-sheen mt-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">Past averages</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          Not today&apos;s flight
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {history.origin} → {history.dest} · {airlineName(history.carrier)} · {history.monthName}
      </p>

      {seatsInfo ? (
        <>
          <div className="mt-4 text-center">
            <p className="font-display text-4xl font-bold leading-none tracking-tight">
              ~{seats(seatsInfo.avgEmptySeats)}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              average empty seats per flight
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat value={pct(seatsInfo.loadFactor)} label="seats sold" />
            <Stat
              value={`${seats(seatsInfo.minEmptySeats)}–${seats(seatsInfo.maxEmptySeats)}`}
              label="empty-seat range by year"
            />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Based on {seatsInfo.departures.toLocaleString()} {history.monthName} departures over
            the last {seatsInfo.years} published year{seatsInfo.years === 1 ? "" : "s"}.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Seat records for this route are not published yet.
        </p>
      )}

      <SeatTrend title={`Avg empty seats each ${history.monthName}`} rows={history.loadPriorYears} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5 text-sm"
      >
        <span>Delays, cancellations and backups</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-1">
          {reliability && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Stat value={pct(reliability.dep15Rate)} label="left late" />
                <Stat value={pct(reliability.cancelRate)} label="cancelled" />
                <Stat
                  value={String(reliability.medianLaterBackups)}
                  label={
                    reliability.medianLaterBackups === 1
                      ? "later flight same day"
                      : "later flights same day"
                  }
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {blockName ? `${blockName} departures in ` : "Departures in "}
                {history.monthName}, {reliability.flightsSampled.toLocaleString()} flights.
              </p>
            </>
          )}

          <TimeOfDay rows={history.timeBlocks} activeBlock={history.timeBlock} />

          <SeatTrend title="Recent months" rows={history.loadRecentMonths} />

          <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
            Source: U.S. Bureau of Transportation Statistics, published a few months behind. Past
            averages only — not today&apos;s seats or your spot on the list.
            {history.notes.length > 0 ? ` ${history.notes.join(" ")}` : ""}
          </p>
        </div>
      )}
    </section>
  );
}
