import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/context/history")({
  head: () => ({
    meta: [
      { title: "How this route usually runs — AirCue" },
      {
        name: "description",
        content:
          "What past government data says about how full and how reliable this route usually is around this time of year.",
      },
      { property: "og:title", content: "How this route usually runs — AirCue" },
      { property: "og:description", content: "Historical pattern for this route and month." },
    ],
  }),
  component: HistoryContext,
});

function HistoryContext() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const history = data?.option?.evidence.history;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
        How this route usually runs
      </h1>

      {!history && (
        <p className="mt-4 text-sm text-muted-foreground">
          We do not have enough past data on this route to say anything useful yet.
        </p>
      )}

      {history && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {history.carrierLabel} · {history.monthLabel}
          </p>

          <div className="mt-5 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-foreground/90">{history.summary}</p>
            {history.loadIndex !== null && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, history.loadIndex))}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  How full this route typically runs this month, compared with the rest of the year.
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 space-y-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Cancellations</p>
              <p className="mt-1 text-sm text-muted-foreground">{history.cancelPattern}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Late departures</p>
              <p className="mt-1 text-sm text-muted-foreground">{history.delayPattern}</p>
            </div>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            Based on published government travel data{" "}
            {history.sourcePeriod ? `(${history.sourcePeriod})` : ""}. History describes the usual
            pattern, not this specific day.
          </p>
        </>
      )}
    </main>
  );
}
