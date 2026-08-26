import { useState } from "react";
import { Bell, BellOff, ChevronLeft, Clock, History, Info, Plane, Share2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { SignalRow } from "@/components/aircue/SignalRow";
import { StatusPill } from "@/components/aircue/StatusPill";
import type { Brief, BriefSection, Signal } from "@/lib/aircue/data";
import { disclaimer } from "@/lib/aircue/data";

function Module({
  title,
  status,
  summary,
  signals,
  unavailable,
}: {
  title: string;
  status: BriefSection["status"];
  summary: string;
  signals: Signal[];
  unavailable?: string[] | undefined;
}) {
  return (
    <section className="mt-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
        <StatusPill status={status} size="sm" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>

      <div className="mt-2 border-t border-border">
        {signals.map((signal) => (
          <SignalRow key={signal.id} signal={signal} />
        ))}
      </div>

      {unavailable && unavailable.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Unavailable at last check: {unavailable.join(", ")}.
        </p>
      )}
    </section>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const [watching, setWatching] = useState(Boolean(brief.watch?.active));
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Screen header */}
      <div className="flex items-center justify-between gap-3 pb-4">
        <Link
          to="/"
          aria-label="Back"
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-semibold">Standby brief</h1>
        <button
          type="button"
          aria-label="Share this brief"
          onClick={() => setShareOpen((v) => !v)}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <Share2 className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* 1. Flight header + 2. Standby outlook */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold">{brief.flightNumber}</span>
          <span className="text-muted-foreground">{brief.date}</span>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight">{brief.origin}</p>
            <p className="text-xs text-muted-foreground">{brief.originCity}</p>
          </div>
          <div className="flex flex-1 items-center gap-2">
            <span className="h-px flex-1 bg-border" />
            <Plane className="h-4 w-4 rotate-45 text-muted-foreground" />
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-bold tracking-tight">{brief.destination}</p>
            <p className="text-xs text-muted-foreground">{brief.destinationCity}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>
            {brief.departsLocal} — {brief.arrivesLocal}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {brief.countdown}
          </span>
        </div>

        <div className="mt-5">
          <StatusPill status={brief.status} size="sm" />
          <h2 className="mt-2.5 font-display text-xl font-bold leading-snug tracking-tight">
            {brief.outlook}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">{brief.generatedAt}</p>
        </div>
      </section>

      {shareOpen && brief.shareToken && (
        <section className="mt-4 rounded-xl border border-border bg-secondary p-4 text-xs">
          <p className="font-medium">Anyone with this link can view this brief</p>
          <p className="mt-1 break-all font-mono text-muted-foreground">
            aircue.app/share/{brief.shareToken}
          </p>
        </section>
      )}

      {/* 3. What changed */}
      <section className="mt-7">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <History className="h-4 w-4 text-muted-foreground" /> What changed
        </h2>
        <ul className="mt-2 border-t border-border">
          {(brief.changes ?? []).map((change) => (
            <li
              key={change.id}
              className="flex gap-3 border-b border-border py-3 text-sm last:border-b-0"
            >
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{change.time}</span>
              <span className="text-foreground/85">{change.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4-6. Departure, Arrival, Flight chain */}
      <Module
        title={`Departure · ${brief.departure.code}`}
        status={brief.departure.status}
        summary={brief.departure.summary}
        signals={brief.departure.signals ?? []}
        unavailable={brief.departure.unavailable}
      />
      <Module
        title={`Arrival · ${brief.arrival.code}`}
        status={brief.arrival.status}
        summary={brief.arrival.summary}
        signals={brief.arrival.signals ?? []}
        unavailable={brief.arrival.unavailable}
      />
      <Module
        title="Flight chain"
        status={brief.chain.status}
        summary={brief.chain.summary}
        signals={brief.chain.signals ?? []}
        unavailable={brief.chain.unavailable}
      />

      {/* 7. Standby impact */}
      <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="font-display text-lg font-bold tracking-tight">Standby impact</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{brief.impact}</p>
      </section>

      {/* Disclaimer + 9. Actions */}
      <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>

      {!readOnly && (
        <div className="mt-4">
          <Button
            variant={watching ? "secondary" : "default"}
            onClick={() => setWatching((v) => !v)}
            className="h-12 w-full text-sm font-semibold"
          >
            {watching ? (
              <>
                <BellOff className="h-4 w-4" /> Stop watching this flight
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" /> Watch this flight
              </>
            )}
          </Button>
          {watching && brief.watch && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Next check {brief.watch.nextCheck}. Email only on a material change.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
