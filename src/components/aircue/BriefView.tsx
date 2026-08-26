import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Clock,
  Info,
  Link2,
  PlaneTakeoff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SignalRow } from "@/components/aircue/SignalRow";
import { StatusPill } from "@/components/aircue/StatusPill";
import type { Brief, BriefSection } from "@/lib/aircue/data";
import { disclaimer } from "@/lib/aircue/data";

const sourceStateLabel = {
  fresh: "Fresh",
  stale: "Stale",
  unavailable: "Unavailable",
} as const;

const sourceStateStyle = {
  fresh: "text-clear-foreground",
  stale: "text-elevated-foreground",
  unavailable: "text-destructive",
} as const;

function Card({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Unavailable({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function AirportSection({ section }: { section: BriefSection }) {
  return (
    <Card
      title={section.label}
      aside={<StatusPill status={section.status} size="sm" />}
    >
      <h3 className="font-display text-xl font-semibold">
        {section.place} · {section.code}
      </h3>
      <div className="mt-1">
        {section.signals.map((signal) => (
          <SignalRow key={signal.id} signal={signal} />
        ))}
      </div>
      <Unavailable items={section.unavailable} />
    </Card>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const [watching, setWatching] = useState(Boolean(brief.watch?.active));
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* 1. Flight header */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-3xl font-bold tracking-tight">{brief.flightNumber}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold">
              {brief.origin} <span className="text-muted-foreground">→</span> {brief.destination}
            </p>
            <p className="text-sm text-muted-foreground">
              {brief.originCity} to {brief.destinationCity}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {brief.date} · {brief.departsLocal} – {brief.arrivesLocal}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-primary">
              <Clock className="h-4 w-4" />
              {brief.countdown}
            </p>
          </div>
          <StatusPill status={brief.status} />
        </div>
      </section>

      {/* 2. Standby outlook */}
      <section className="flex items-start gap-3 rounded-xl border border-elevated/60 bg-elevated-soft p-5">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-elevated-foreground" />
        <div>
          <p className="font-semibold">Standby outlook</p>
          <p className="mt-1 text-sm text-foreground/80">{brief.statusSentence}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Generated {brief.generatedAt}. Clear never means open seats or likely boarding.
          </p>
        </div>
      </section>

      {/* 9. Actions */}
      {!readOnly && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {watching ? "Watching this flight" : "Not watching this flight"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {watching && brief.watch
                ? `Next check ${brief.watch.nextCheck} · ${brief.watch.cadence}. ${brief.watch.expires}.`
                : "Aircue only monitors flights you choose to watch, and emails you once per material change."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={watching ? "secondary" : "default"}
              onClick={() => setWatching((v) => !v)}
              className="h-11 font-semibold"
            >
              {watching ? (
                <>
                  <BellOff className="h-4 w-4" /> Stop watching
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" /> Watch this flight
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 font-semibold"
              onClick={() => setShareOpen((v) => !v)}
            >
              <Link2 className="h-4 w-4" /> Share brief
            </Button>
          </div>
        </section>
      )}

      {shareOpen && brief.shareToken && (
        <section className="rounded-xl border border-border bg-secondary p-4 text-sm">
          <p className="font-medium">Read-only link</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            aircue.app/share/{brief.shareToken}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Expires after the trip. It shows the brief only and never exposes your account or email.
          </p>
        </section>
      )}

      {/* 3. What changed */}
      <Card title="What changed">
        <ol className="space-y-3">
          {brief.changes.map((change) => (
            <li key={change.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>
                <span className="block text-xs text-muted-foreground">{change.time}</span>
                {change.text}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* 4 & 5. Departure and arrival */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AirportSection section={brief.departure} />
        <AirportSection section={brief.arrival} />
      </div>

      {/* 6. Flight chain */}
      <Card title="Flight chain">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <PlaneTakeoff className="h-4 w-4" />
          Inbound aircraft, selected-flight status, and earlier route cancellations
        </div>
        <div className="mt-1">
          {brief.chain.signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </div>
        <Unavailable items={brief.chain.unavailable} />
      </Card>

      {/* 7. Standby impact */}
      <Card title="Standby impact">
        <ul className="space-y-2.5 text-sm">
          {brief.impact.map((line) => (
            <li key={line} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-context" />
              {line}
            </li>
          ))}
        </ul>
      </Card>

      {/* 8. Evidence */}
      <Card title="Evidence and freshness">
        <ul className="divide-y divide-border/70">
          {brief.sources.map((source) => (
            <li key={source.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <span>
                <span className="text-sm font-medium">{source.name}</span>
                <span className="block text-xs text-muted-foreground">{source.category}</span>
              </span>
              <span className="text-right text-xs">
                <span className={`font-semibold uppercase tracking-wide ${sourceStateStyle[source.state]}`}>
                  {sourceStateLabel[source.state]}
                </span>
                <span className="block text-muted-foreground">{source.updated}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-muted-foreground">{disclaimer}</p>
    </div>
  );
}
