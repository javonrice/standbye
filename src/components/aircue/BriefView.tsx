import { useState } from "react";
import {
  Bell,
  BellOff,
  ChevronDown,
  ChevronLeft,
  Clock,
  CloudSun,
  Frown,
  Info,
  Meh,
  Plane,
  Share2,
  ShieldCheck,
  Shuffle,
  Smile,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Brief } from "@/lib/aircue/data";
import { disclaimer } from "@/lib/aircue/data";
import { getCueBrief, type Cue, type CueKey, type CueTone } from "@/lib/aircue/cues";

const toneText: Record<CueTone, string> = {
  helpful: "text-fine",
  mixed: "text-watch",
  harder: "text-rough",
};

const toneBar: Record<CueTone, string> = {
  helpful: "bg-fine",
  mixed: "bg-watch",
  harder: "bg-rough",
};

const toneIcon: Record<CueTone, React.ComponentType<{ className?: string }>> = {
  helpful: Smile,
  mixed: Meh,
  harder: Frown,
};

const cueIcon: Record<CueKey, React.ComponentType<{ className?: string }>> = {
  route: Shuffle,
  reliability: Clock,
  backup: ShieldCheck,
  weather: CloudSun,
  demand: Users,
};

function CueRow({ cue }: { cue: Cue }) {
  const [open, setOpen] = useState(false);
  const Icon = cueIcon[cue.key];
  const ToneIcon = toneIcon[cue.tone];

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-1 py-4 text-left"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{cue.label}</span>
            <span
              className={cn("flex items-center gap-1.5 text-xs font-medium", toneText[cue.tone])}
            >
              <ToneIcon className="h-3.5 w-3.5" />
              {cue.toneLabel}
            </span>
          </span>
          <span className="mt-2.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full transition-all", toneBar[cue.tone])}
              style={{ width: `${cue.score}%` }}
            />
          </span>
        </span>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="pb-4 pl-9 pr-1">
          <p className="text-sm leading-relaxed text-foreground/80">{cue.summary}</p>
          <ul className="mt-3 space-y-1.5">
            {cue.evidence.map((line) => (
              <li key={line} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const [watching, setWatching] = useState(Boolean(brief.watch?.active));
  const [shareOpen, setShareOpen] = useState(false);
  const cueBrief = getCueBrief(brief.id);
  const SetupIcon = toneIcon[cueBrief?.setupTone ?? "mixed"];

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

      {/* Flight card */}
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

        {cueBrief && (
          <div className="mt-5">
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-semibold",
                toneText[cueBrief.setupTone],
              )}
            >
              <SetupIcon className="h-4 w-4" />
              {cueBrief.setupLabel}
            </span>
            <h2 className="mt-2.5 font-display text-xl font-bold leading-snug tracking-tight">
              {cueBrief.headline}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {cueBrief.subline}
            </p>
          </div>
        )}
      </section>

      {shareOpen && brief.shareToken && (
        <section className="mt-4 rounded-xl border border-border bg-secondary p-4 text-xs">
          <p className="font-medium">Anyone with this link can see this brief</p>
          <p className="mt-1 break-all font-mono text-muted-foreground">
            aircue.app/share/{brief.shareToken}
          </p>
        </section>
      )}

      {/* Cues */}
      {cueBrief && (
        <section className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <h2 className="font-display text-lg font-bold tracking-tight">Your AirCues</h2>
            <span className="text-xs text-muted-foreground">Tap for evidence</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Frown className="h-3.5 w-3.5" /> Harder
            </span>
            <span className="flex items-center gap-1.5">
              <Meh className="h-3.5 w-3.5" /> Mixed
            </span>
            <span className="flex items-center gap-1.5">
              <Smile className="h-3.5 w-3.5" /> Helpful
            </span>
          </div>

          <div className="mt-2 border-t border-border">
            {cueBrief.cues.map((cue) => (
              <CueRow key={cue.key} cue={cue} />
            ))}
          </div>
        </section>
      )}

      {/* Disclaimer + action */}
      <p className="mt-7 text-center text-xs leading-relaxed text-muted-foreground">
        {disclaimer}
      </p>

      {!readOnly && (
        <div className="mt-4">
          <Button
            variant={watching ? "secondary" : "default"}
            onClick={() => setWatching((v) => !v)}
            className="h-12 w-full text-sm font-semibold"
          >
            {watching ? (
              <>
                <BellOff className="h-4 w-4" /> Stop watching this trip
              </>
            ) : (
              <>
                <Bell className="h-4 w-4" /> Watch this trip
              </>
            )}
          </Button>
          {watching && brief.watch && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Next check at {brief.watch.nextCheck}. We only email when something real changes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
