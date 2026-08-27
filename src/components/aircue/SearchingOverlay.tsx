import { useEffect, useState } from "react";
import { Check, Plane } from "lucide-react";

/**
 * Full-screen "we are working" screen shown once a specific flight leg is
 * confirmed and its brief is being built. The "Precision Flight Pulse" design
 * uses a calm radar sweep, a glowing route arc, and a ticking checklist so
 * travellers know something is happening without feeling frantic.
 */

export type SearchingPhase = "building";

const BUILDING_STEPS = [
  "Reading airport conditions",
  "Pulling weather at both ends",
  "Tracing the aircraft chain",
  "Checking booking inventory",
  "Weighing standby pressure",
] as const;

/** Slowing cadence so the list never runs out before the work is done. */
const STEP_AT_MS = [0, 1400, 3200, 5600, 8800, 13000];

interface SearchingOverlayProps {
  phase: SearchingPhase;
  /** e.g. "UA1448" — omitted when the traveller entered a route by hand. */
  flightLabel?: string | undefined;
  origin?: string | undefined;
  dest?: string | undefined;
}

export function SearchingOverlay({ phase, flightLabel, origin, dest }: SearchingOverlayProps) {
  const steps = BUILDING_STEPS;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, [phase]);

  // The last step stays active rather than completing — the screen only ends
  // when the real work does.
  const step = Math.min(steps.length - 1, STEP_AT_MS.filter((t) => elapsed >= t).length - 1);
  const progress = Math.min(90, Math.round(((step + 1) / steps.length) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/96 px-6 backdrop-blur-xl"
    >
      <div className="w-full max-w-[22rem] flex-col items-center">
        {/* Header flight info */}
        <div className="text-center">
          {flightLabel ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                Flight {flightLabel}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                Building brief
              </span>
            </div>
          )}

          <div className="mt-4 flex items-center justify-center gap-4">
            <span className="font-display text-2xl font-light tracking-tight">
              {origin ?? "---"}
            </span>
            <div className="relative h-px w-10 bg-border">
              <div className="absolute inset-0 bg-primary/50 blur-[2px]" />
            </div>
            <span className="font-display text-2xl font-light tracking-tight text-muted-foreground">
              {dest ?? "---"}
            </span>
          </div>
        </div>

        {/* Central radar visualization */}
        <div className="relative mx-auto mt-12 flex h-64 w-64 items-center justify-center">
          <span aria-hidden className="cue-pulse-ring" style={{ animationDelay: "0s" }} />
          <span aria-hidden className="cue-pulse-ring" style={{ animationDelay: "1.1s" }} />
          <span aria-hidden className="cue-pulse-ring" style={{ animationDelay: "2.2s" }} />

          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="cue-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="transparent" />
                <stop offset="100%" stopColor="var(--primary)" />
              </linearGradient>
            </defs>

            <circle cx="50" cy="50" r="46" className="cue-grid-ring" />
            <circle cx="50" cy="50" r="30" className="cue-grid-ring" />
            <circle cx="50" cy="50" r="14" className="cue-grid-ring" />

            <path
              d="M 20 50 A 30 30 0 0 1 80 50"
              className="cue-arc-track"
              fill="none"
              pathLength={100}
            />
            <path
              d="M 20 50 A 30 30 0 0 1 80 50"
              className="cue-arc-draw"
              fill="none"
              pathLength={100}
            />
          </svg>

          <span aria-hidden className="cue-sweep" />

          <div className="relative z-10 flex h-12 w-12 items-center justify-center">
            <Plane className="h-6 w-6 text-primary" />
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" />
          </div>
        </div>

        {/* Natural language checklist */}
        <ul className="mt-8 w-full space-y-3">
          {steps.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li
                key={label}
                className={`flex items-center gap-3 text-sm transition-all duration-500 ${
                  done || active ? "opacity-100" : "opacity-35"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : active
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border"
                  }`}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : active ? (
                    <span className="cue-dot-pulse h-1.5 w-1.5 rounded-full bg-primary" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span
                  className={
                    active ? "font-medium text-foreground" : "text-muted-foreground"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Progress footer */}
        <div className="mt-10 flex items-end justify-between border-t border-border/40 pt-5">
          <div className="space-y-1">
            <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Status
            </p>
            <p className="font-mono text-xs text-primary/80">{progress}% complete</p>
          </div>
          <p className="text-[0.65rem] italic text-muted-foreground/70">Calculating…</p>
        </div>
      </div>
    </div>
  );
}
