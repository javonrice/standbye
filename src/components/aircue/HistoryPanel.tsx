import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { airlineName } from "@/lib/aircue/airlines";
import { timeBlockRange, timeBlockShort } from "@/lib/aircue/history";
import type { HistoryPatternRow, RouteHistory } from "@/lib/aircue/history";

function pct(value: number) {
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)}%`;
}

function toneFor(rate: number) {
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

function TimeOfDay({
  rows,
  activeBlock,
}: {
  rows: HistoryPatternRow[];
  activeBlock: string | null;
}) {
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
                <Bar value={row.dep15Rate} max={max} tone={toneFor(row.dep15Rate)} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {pct(row.dep15Rate)} left late · {pct(row.cancelRate)} cancelled
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Trend({
  title,
  rows,
  caption,
}: {
  title: string;
  rows: HistoryPatternRow[];
  caption: string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.dep15Rate), 10);

  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
            <Bar value={row.dep15Rate} max={max} tone={toneFor(row.dep15Rate)} />
            <span className="w-20 shrink-0 text-right text-xs text-foreground/80">
              {pct(row.dep15Rate)} late
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export function HistoryPanel({ history }: { history: RouteHistory }) {
  const [open, setOpen] = useState(false);
  const headline = history.byTimeBlock ?? history.typical;
  const blockName = history.timeBlock ? timeBlockShort[history.timeBlock] : null;

  return (
    <section className="glass glass-sheen mt-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">Track record</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          Context
        </span>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {history.origin} → {history.dest} · {airlineName(history.carrier)} ·{" "}
        {blockName ? `${blockName.toLowerCase()} departures in ` : ""}
        {history.monthName}
      </p>

      {headline ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Stat value={pct(headline.dep15Rate)} label="left 15+ min late" />
            <Stat value={pct(headline.cancelRate)} label="cancelled" />
            <Stat
              value={String(headline.medianLaterBackups)}
              label={
                headline.medianLaterBackups === 1 ? "later flight same day" : "later flights same day"
              }
            />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground/80">
            Based on {headline.flightsSampled.toLocaleString()} past departures in {history.monthName}.
            This is how the route has behaved before — not today&apos;s seats.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Historical records for this route are not available yet.
        </p>
      )}

      <TimeOfDay rows={history.timeBlocks} activeBlock={history.timeBlock} />

      {history.load && (
        <p className="mt-4 text-sm leading-relaxed text-foreground/80">
          In {history.load.label} this route ran {Math.round(history.load.loadFactor)}% full — about{" "}
          {Math.round(history.load.avgEmptySeats)} empty seats per departure. That is a past average,
          not today&apos;s open seats.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5 text-sm"
      >
        <span>See the months behind this</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-1">
          {history.typical && (
            <p className="mt-4 text-sm leading-relaxed text-foreground/80">
              Across all times of day, {history.typical.label} left late{" "}
              {pct(history.typical.dep15Rate)} of the time.
            </p>
          )}

          <Trend
            title="Recent months"
            rows={history.recentMonths}
            caption="Most recent published months leading up to your trip."
          />
          <Trend
            title={`${history.monthName} in past years`}
            rows={history.sameMonthPriorYears}
            caption={`Same month, earlier years — how ${history.monthName} usually behaves on this route.`}
          />

          {history.loadPriorYears.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                How full it ran in {history.monthName}
              </p>
              <div className="mt-2 space-y-2">
                {history.loadPriorYears.map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                    <Bar value={row.loadFactor} max={100} tone="bg-fine" />
                    <span className="w-20 shrink-0 text-right text-xs text-foreground/80">
                      {Math.round(row.loadFactor)}% full
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-5 space-y-1 text-xs text-muted-foreground">
            <li>Source: U.S. Bureau of Transportation Statistics (free public data).</li>
            {history.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Government data is published a month or two behind, so the most recent weeks are not
              covered here. History is context only — it is not today&apos;s seats, your list
              position, or a chance of clearing.
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
