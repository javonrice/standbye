import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

import type { WatchSummary } from "@/lib/aircue/plan.functions";

interface PlanChangedTakeoverProps {
  watches: WatchSummary[];
  onDismiss: () => void;
}

/**
 * Full-screen state shown when a watched plan moved enough to matter.
 * The user should decide again before doing anything else.
 */
export function PlanChangedTakeover({ watches, onDismiss }: PlanChangedTakeoverProps) {
  const first = watches[0];
  if (!first) return null;
  const others = watches.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-background/95 backdrop-blur-sm md:items-center md:justify-center">
      <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:rounded-3xl md:pb-6">
        <span className="inline-flex items-center gap-2 rounded-full bg-rough-soft px-3 py-1 text-xs font-semibold text-rough-foreground ring-1 ring-rough/40">
          <AlertTriangle className="h-3.5 w-3.5" /> Your plan changed
        </span>

        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">
          Something moved on {first.flightLabel}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {first.origin} → {first.dest} on {first.travelDate}. {first.verdict}
        </p>
        {others > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {others} other watched {others === 1 ? "setup has" : "setups have"} updates too.
          </p>
        )}

        <Link
          to="/watching/$watchId"
          params={{ watchId: first.id }}
          onClick={onDismiss}
          className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          See what changed <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
