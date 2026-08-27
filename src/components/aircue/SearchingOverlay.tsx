import { useEffect, useState } from "react";
import { Check, Plane } from "lucide-react";

/**
 * Full-screen "we are working" screen shown while a brief is being built.
 * Reads like a departure board coming to life: a radar sweep over a great-circle
 * arc, a plane tracing the route, and the checks ticking off as they run.
 */

const STEPS = [
  "Reading airport conditions",
  "Pulling weather at both ends",
  "Tracing the aircraft chain",
  "Checking booking inventory",
  "Weighing standby pressure",
] as const;

interface SearchingOverlayProps {
  /** e.g. "UA1448" — omitted when the traveller entered a route by hand. */
  flightLabel?: string | undefined;
  origin?: string | undefined;
  dest?: string | undefined;
}

export function SearchingOverlay({ flightLabel, origin, dest }: SearchingOverlayProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/92 px-6 backdrop-blur-xl"
    >
      <div className="relative flex h-56 w-56 items-center justify-center">
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "0s" }} />
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "1s" }} />
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "2s" }} />
        <span aria-hidden className="cue-radar-sweep" />

        <svg viewBox="0 0 200 200" className="relative h-56 w-56" aria-hidden>
          <circle cx="100" cy="100" r="76" className="cue-radar-grid" />
          <circle cx="100" cy="100" r="46" className="cue-radar-grid" />
          <path
            d="M32 132 C 70 60, 130 60, 168 132"
            className="cue-arc-track"
            fill="none"
            pathLength={100}
          />
          <path
            d="M32 132 C 70 60, 130 60, 168 132"
            className="cue-arc-draw"
            fill="none"
            pathLength={100}
          />
          <circle cx="32" cy="132" r="4.5" className="cue-node" />
          <circle cx="168" cy="132" r="4.5" className="cue-node" />
        </svg>

        <span aria-hidden className="cue-plane">
          <Plane className="h-5 w-5 rotate-90 text-primary" />
        </span>
      </div>

      <p className="mt-2 font-display text-lg font-semibold tracking-tight">
        {flightLabel ?? "Your flight"}
        {origin && dest ? (
          <span className="text-muted-foreground">
            {" "}
            · {origin} → {dest}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">Building your standby brief</p>

      <ul className="mt-6 w-full max-w-xs space-y-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li
              key={label}
              className={`flex items-center gap-2.5 text-sm transition-all duration-500 ${
                done || active ? "opacity-100" : "opacity-35"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-fine/60 bg-fine/20 text-fine"
                    : active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground"
                }`}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span className={active ? "cue-dot-pulse h-1.5 w-1.5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/50"} />
                )}
              </span>
              <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
