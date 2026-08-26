import { Link } from "@tanstack/react-router";
import { Bell, ChevronLeft, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SignalRow } from "@/components/aircue/SignalRow";
import { StatusPill } from "@/components/aircue/StatusPill";
import type { Brief, BriefStatus, Signal } from "@/lib/aircue/data";
import { disclaimer, missingSources, statusMeaning } from "@/lib/aircue/data";

function Section({
  title,
  status,
  summary,
  signals,
  briefId,
  unavailable,
}: {
  title: string;
  status: BriefStatus;
  summary: string;
  signals: Signal[];
  briefId: string;
  unavailable?: string[] | undefined;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
        <StatusPill status={status} size="sm" />
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{summary}</p>

      {signals.length > 0 && (
        <div className="mt-2 border-t border-border">
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} briefId={briefId} />
          ))}
        </div>
      )}

      {unavailable && unavailable.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          We could not check: {unavailable.join(", ")}.
        </p>
      )}
    </section>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const missing = missingSources(brief);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex items-center justify-between gap-3 pb-4">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      {/* Flight header */}
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {brief.flightNumber} · {brief.origin} → {brief.destination}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {brief.date} · Departs {brief.departsLocal}
        </p>
        <p className="text-sm text-muted-foreground">Arrives {brief.arrivesLocal}</p>
        <p className="mt-1 text-sm font-medium">{brief.countdown}</p>
      </header>

      {/* Status first */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <StatusPill status={brief.status} />
        <p className="mt-3 font-display text-xl font-bold leading-snug tracking-tight">
          {brief.outlook}
        </p>
      </section>

      {/* What this means */}
      <section className="mt-6">
        <h2 className="font-display text-base font-bold tracking-tight">What this means</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
          {statusMeaning[brief.status]}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{brief.impact}</p>
      </section>

      {brief.status === "incomplete" && (
        <section className="mt-6 rounded-2xl border border-border bg-secondary p-5 text-sm">
          <p className="font-semibold">Missing</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {(missing.length > 0 ? missing : ["Live flight status unavailable"]).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-3 font-semibold">Still available</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            <li>{brief.arrival.summary}</li>
            <li>{brief.departure.summary}</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            We will not say “Clear” when required data is missing.
          </p>
        </section>
      )}

      {/* What changed */}
      {(brief.changes ?? []).length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-base font-bold tracking-tight">What changed</h2>
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
      )}

      <Section
        title={`Departure · ${brief.departure.place}`}
        status={brief.departure.status}
        summary={brief.departure.summary}
        signals={brief.departure.signals ?? []}
        unavailable={brief.departure.unavailable}
        briefId={brief.id}
      />
      <Section
        title={`Arrival · ${brief.arrival.place}`}
        status={brief.arrival.status}
        summary={brief.arrival.summary}
        signals={brief.arrival.signals ?? []}
        unavailable={brief.arrival.unavailable}
        briefId={brief.id}
      />
      <Section
        title="Flight chain"
        status={brief.chain.status}
        summary={brief.chain.summary}
        signals={brief.chain.signals ?? []}
        unavailable={brief.chain.unavailable}
        briefId={brief.id}
      />

      {!readOnly && (
        <div className="mt-6 space-y-3">
          <Button asChild className="h-12 w-full text-sm font-semibold">
            <Link to="/brief/$briefId/watch" params={{ briefId: brief.id }}>
              <Bell className="h-4 w-4" /> Watch this flight
            </Link>
          </Button>
          {brief.shareToken && (
            <Button asChild variant="secondary" className="h-12 w-full text-sm font-semibold">
              <Link to="/share/$token" params={{ token: brief.shareToken }}>
                <Share2 className="h-4 w-4" /> Share brief
              </Link>
            </Button>
          )}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{brief.generatedAt}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>
    </div>
  );
}
