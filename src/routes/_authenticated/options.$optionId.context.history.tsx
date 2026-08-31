import { createFileRoute } from "@tanstack/react-router";

import {
  DataBar,
  DetailHeading,
  DetailShell,
} from "@/components/aircue/DetailScreen";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/context/history")({
  head: () => ({
    meta: [
      { title: "How this route usually runs — Standbye" },
      {
        name: "description",
        content:
          "What past government data says about how full and how reliable this route usually is around this time of year.",
      },
      { property: "og:title", content: "How this route usually runs — Standbye" },
      { property: "og:description", content: "Historical pattern for this route and month." },
    ],
  }),
  component: HistoryContext,
});

/**
 * Qualitative history facts: delay/cancellation patterns render as plain facts.
 * Only loadIndex (a real numeric metric) gets a bar.
 */
function HistoryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}



function HistoryContext() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const history = data?.option?.evidence.history;

  return (
    <DetailShell
      optionId={optionId}
      title="How this route usually runs"
      subtitle={history ? `${history.carrierLabel} · ${history.monthLabel}` : undefined}
    >
      {!history && (
        <p className="mt-5 text-sm text-muted-foreground">
          We do not have enough past data on this route to say anything useful yet.
        </p>
      )}

      {history && (
        <>
          <DetailHeading>The usual pattern</DetailHeading>
          <div className="mt-1 divide-y divide-border/70">
            {history.loadIndex !== null && (
              <DataBar
                label="How full it runs"
                fill={history.loadIndex}
                value={
                  history.loadIndex >= 75
                    ? "Usually full"
                    : history.loadIndex >= 45
                      ? "Moderately full"
                      : "Usually room"
                }
              />
            )}
            <DataBar
              label="Late departures"
              fill={scaleFor(history.delayPattern)}
              value={history.delayPattern}
              tone="muted"
            />
            <DataBar
              label="Cancellations"
              fill={scaleFor(history.cancelPattern)}
              value={history.cancelPattern}
              tone="muted"
            />
          </div>

          <StandbyeTake className="mt-6">{history.summary}</StandbyeTake>

          <p className="mt-5 text-xs text-muted-foreground">
            Based on published government travel data{" "}
            {history.sourcePeriod ? `(${history.sourcePeriod})` : ""}. History describes the usual
            pattern, not this specific day.
          </p>
        </>
      )}
    </DetailShell>
  );
}
