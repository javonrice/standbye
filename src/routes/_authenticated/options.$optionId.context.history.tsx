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
 * Turns the plain-language pattern we already publish into a rough bar length.
 * The words stay the truth; the bar is only a relative sense of scale.
 */
function scaleFor(pattern: string): number {
  const text = pattern.toLowerCase();
  if (text.includes("almost never") || text.includes("very rarely")) return 8;
  if (text.includes("rarely") || text.includes("seldom")) return 18;
  if (text.includes("small") || text.includes("now and then") || text.includes("occasional"))
    return 32;
  if (text.includes("often") || text.includes("frequent")) return 72;
  if (text.includes("regularly") || text.includes("sometimes")) return 50;
  return 40;
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
