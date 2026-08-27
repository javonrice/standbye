import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { airlineName } from "@/lib/aircue/airlines";
import type { RouteHistory } from "@/lib/aircue/history";

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const width = max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
    </div>
  );
}

function Trend({
  title,
  rows,
  caption,
}: {
  title: string;
  rows: { label: string; cancelRate: number; dep15Rate: number }[];
  caption: string;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.dep15Rate), 10);

  return (
    <div className="mt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
            <Bar value={row.dep15Rate} max={max} tone="bg-primary" />
            <span className="w-24 shrink-0 text-right text-xs text-foreground/80">
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
  const headline = history.typical ?? history.byTimeBlock;

  return (
    <section className="glass glass-sheen mt-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">Track record</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
          Context
        </span>
      </div>

      {headline ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          On {history.origin} → {history.dest} with {airlineName(history.carrier)},{" "}
          {headline.label} have historically
          been cancelled {pct(headline.cancelRate)} of the time and left 15+ minutes late{" "}
          {pct(headline.dep15Rate)} of the time, with a typical{" "}
          {headline.medianLaterBackups === 0
            ? "no later flight that same day"
            : `${headline.medianLaterBackups} later flight${headline.medianLaterBackups === 1 ? "" : "s"} the same day`}{" "}
          as backup.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Historical records for this route are not available yet.
        </p>
      )}

      {history.byTimeBlock && history.typical && (
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          Looking just at {history.byTimeBlock.label}:{" "}
          {pct(history.byTimeBlock.cancelRate)} cancelled, {pct(history.byTimeBlock.dep15Rate)} late.
        </p>
      )}

      {history.load && (
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          In {history.load.label} this route ran {history.load.loadFactor.toFixed(1)}% full — about{" "}
          {history.load.avgEmptySeats.toFixed(1)} empty seats per departure
          {history.load.vsNetworkPp === null
            ? ""
            : `, ${Math.abs(history.load.vsNetworkPp).toFixed(1)} points ${
                history.load.vsNetworkPp >= 0 ? "fuller" : "emptier"
              } than the airline's network average`}
          . That is a past average, not today's open seats.
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5 text-sm"
      >
        <span>See the months behind this</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-1">
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
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                How full it ran in {history.monthName}
              </p>
              <div className="mt-2 space-y-2">
                {history.loadPriorYears.map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</span>
                    <Bar value={row.loadFactor} max={100} tone="bg-fine" />
                    <span className="w-24 shrink-0 text-right text-xs text-foreground/80">
                      {row.loadFactor.toFixed(1)}% full
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
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
