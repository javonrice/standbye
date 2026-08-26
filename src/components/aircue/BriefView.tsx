import { useState } from "react";
import { Bell, BellOff, Clock, Info, Link2, Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SignalRow } from "@/components/aircue/SignalRow";
import { StatusPill } from "@/components/aircue/StatusPill";
import type { Brief, BriefSection, BriefStatus } from "@/lib/aircue/data";
import { disclaimer } from "@/lib/aircue/data";

const verdictTone: Record<BriefStatus, string> = {
  fine: "border-fine/50 bg-fine-soft",
  watch: "border-watch/50 bg-watch-soft",
  rough: "border-rough/40 bg-rough-soft",
  unknown: "border-border bg-muted",
};

const dotTone: Record<BriefStatus, string> = {
  fine: "bg-fine",
  watch: "bg-watch",
  rough: "bg-rough",
  unknown: "bg-muted-foreground",
};

function Card({
  title,
  status,
  children,
}: {
  title: string;
  status?: BriefStatus;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {status && <StatusPill status={status} size="sm" />}
      </div>
      {children}
    </section>
  );
}

function Note({ text }: { text?: string | undefined }) {
  if (!text) return null;
  return (
    <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
}

function AirportCard({ section }: { section: BriefSection }) {
  return (
    <Card title={`${section.label} ${section.place}`} status={section.status}>
      <p className="mt-2 text-sm text-muted-foreground">{section.summary}</p>
      <div className="mt-5 space-y-4">
        {(section.signals ?? []).map((signal) => (
          <SignalRow key={signal.id} signal={signal} />
        ))}
      </div>
      <Note text={section.note} />
    </Card>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const [watching, setWatching] = useState(Boolean(brief.watch?.active));
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <div className="space-y-5">
      {/* Verdict */}
      <section className={`rounded-2xl border p-6 sm:p-7 ${verdictTone[brief.status]}`}>
        <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
          <StatusPill status={brief.status} />
          <span className="flex items-center gap-1.5 text-foreground/70">
            <Plane className="h-4 w-4" />
            {brief.flightNumber} · {brief.originCity} to {brief.destinationCity}
          </span>
        </div>

        <h1 className="mt-4 font-display text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
          {brief.verdict}
        </h1>

        <ul className="mt-4 space-y-2">
          {(brief.reasons ?? []).map((reason) => (
            <li key={reason} className="flex items-start gap-2.5 text-base">
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${dotTone[brief.status]}`} />
              {reason}
            </li>
          ))}
        </ul>

        <p className="mt-5 text-sm text-foreground/70">
          It is still your call. We cannot see open seats or the standby list.
        </p>
      </section>

      {/* Flight facts */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="font-display text-2xl font-bold tracking-tight">
            {brief.origin} <span className="text-muted-foreground">→</span> {brief.destination}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {brief.date} · {brief.departsLocal} to {brief.arrivesLocal}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Clock className="h-4 w-4" />
          {brief.countdown}
        </p>
      </section>

      {/* Actions */}
      {!readOnly && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">
              {watching ? "We are watching this flight" : "Not watching this flight"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {watching && brief.watch
                ? `Next check at ${brief.watch.nextCheck}. We email you only when something real changes.`
                : "Turn this on and we will email you if something changes."}
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
              <Link2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </section>
      )}

      {shareOpen && brief.shareToken && (
        <section className="rounded-2xl border border-border bg-secondary p-5 text-sm">
          <p className="font-medium">Anyone with this link can see the brief</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            aircue.app/share/{brief.shareToken}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            It shows this page only, never your account or email.
          </p>
        </section>
      )}

      {/* Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <AirportCard section={brief.departure} />
        <AirportCard section={brief.arrival} />

        <Card title="This flight">
          <p className="mt-2 text-sm text-muted-foreground">{brief.chain.summary}</p>
          <div className="mt-5 space-y-4">
            {(brief.chain?.signals ?? []).map((signal) => (
              <SignalRow key={signal.id} signal={signal} />
            ))}
          </div>
          <Note text={brief.chain.note} />
        </Card>

        <Card title="What changed today">
          <ol className="mt-3 space-y-3">
            {(brief.changes ?? []).map((change) => (
              <li key={change.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  <span className="block text-xs text-muted-foreground">{change.time}</span>
                  {change.text}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Last checked at {brief.generatedAt}.</p>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">{disclaimer}</p>
    </div>
  );
}
