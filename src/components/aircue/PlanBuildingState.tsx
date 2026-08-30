import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Transitional Plan-building state.
 *
 * Standbye does not get provider-level progress back, so the checklist is
 * presented as the work Standbye is doing overall — never as a claim that a
 * specific provider call has finished. Steps stay "in progress" until the
 * whole build resolves; only earlier phases of our own sequence are ticked.
 */
const STEPS = [
  "Checking today's flights",
  "Looking at realistic backups",
  "Reading today's conditions",
] as const;

const STEP_AT_MS = [0, 2600, 6000];

interface PlanBuildingStateProps {
  origin?: string | undefined;
  dest?: string | undefined;
  flightLabel?: string | undefined;
}

export function PlanBuildingState({ origin, dest, flightLabel }: PlanBuildingStateProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - started), 200);
    return () => window.clearInterval(id);
  }, []);

  const active = Math.min(STEPS.length - 1, STEP_AT_MS.filter((t) => elapsed >= t).length - 1);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/97 px-7 backdrop-blur-xl"
    >
      <div className="w-full max-w-[20rem]">
        <p className="font-display text-[28px] font-bold leading-none tracking-tight">
          {flightLabel ?? `${origin || "—"} → ${dest || "—"}`}
        </p>
        <p className="mt-2 text-[15px] text-muted-foreground">Building your standby plan…</p>

        <ul className="mt-7 space-y-3">
          {STEPS.map((step, i) => {
            const done = i < active;
            return (
              <li key={step} className="flex items-center gap-3 text-[15px]">
                {done ? (
                  <Check className="h-4 w-4 shrink-0 text-fine-foreground" />
                ) : i === active ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                  />
                )}
                <span className={done ? "text-muted-foreground" : "font-medium"}>{step}</span>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-[14px] leading-relaxed text-muted-foreground">
          Finding the ways that actually make sense.
        </p>
      </div>
    </div>
  );
}
