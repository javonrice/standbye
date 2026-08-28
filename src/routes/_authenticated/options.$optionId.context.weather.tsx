import { createFileRoute } from "@tanstack/react-router";

import {
  DetailHeading,
  DetailLead,
  FactGroup,
  FactRow,
  DetailShell,
} from "@/components/aircue/DetailScreen";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/context/weather")({
  head: () => ({
    meta: [
      { title: "Operating conditions — Standbye" },
      {
        name: "description",
        content:
          "Airport programs, current delays, and the weather picture that could shake up this standby attempt.",
      },
      { property: "og:title", content: "Operating conditions — Standbye" },
      { property: "og:description", content: "Airport programs, delays, and weather." },
    ],
  }),
  component: WeatherContext,
});

function WeatherContext() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const option = data?.option;
  const conditions = option?.evidence.conditions;

  return (
    <DetailShell
      optionId={optionId}
      title="Operating conditions"
      subtitle={conditions ? `Around your departure window` : undefined}
    >
      {!conditions && (
        <p className="mt-5 text-sm text-muted-foreground">
          We do not have a live read on conditions for this one right now.
        </p>
      )}

      {conditions && (
        <>
          <DetailHeading>{conditions.airport}</DetailHeading>
          <DetailLead
            state={conditions.forecastState}
            label={
              conditions.forecastState === "good"
                ? "Normal operations"
                : conditions.forecastState === "fair"
                  ? "Watch the field"
                  : conditions.forecastState === "poor"
                    ? "Rough operating day"
                    : "Conditions unclear"
            }
          />

          <FactGroup>
            <FactRow label="Departure weather" value={conditions.weather} />
            {conditions.forecast && (
              <FactRow label="Through your window" value={conditions.forecast} />
            )}
            <FactRow label="FAA programs" value={conditions.faa} />
            <FactRow label="Delays right now" value={conditions.delays} />
          </FactGroup>

          <StandbyeTake className="mt-5">{conditions.note}</StandbyeTake>
        </>
      )}
    </DetailShell>
  );
}
