import { useEffect, useState } from "react";
import { Check, Plane } from "lucide-react";

/**
 * Full-screen "we are working" screen shown once a specific flight leg is
 * confirmed and its brief is being built. Reads like a departure board coming
 * to life: a radar sweep over a great-circle arc, a plane tracing the route,
 * and the checks ticking off as they run.
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/92 px-6 backdrop-blur-xl"
    >
      <div className="relative flex h-56 w-56 items-center justify-center">
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "0s" }} />
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "1.1s" }} />
        <span aria-hidden className="cue-radar-ring" style={{ animationDelay: "2.2s" }} />
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

          <g className="cue-plane-mover">
            <g transform="rotate(90)">
              <Plane className="cue-plane-icon" width={14} height={14} x={-7} y={-7} />
            </g>
            <animateMotion
              dur="3s"
              repeatCount="indefinite"
              rotate="auto"
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="spline"
              keySplines="0.42 0 0.58 1"
              path="M32 132 C 70 60, 130 60, 168 132"
            />
          </g>
        </svg>
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
        {steps.map((label, i) => {
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
                  <span
                    className={
                      active
                        ? "cue-dot-pulse h-1.5 w-1.5 rounded-full bg-primary"
                        : "h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
                    }
                  />
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
