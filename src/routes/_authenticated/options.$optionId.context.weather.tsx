import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useOption } from "@/lib/aircue/use-option";
import { pillarDot } from "@/lib/aircue/standby";

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
  const conditions = data?.option?.evidence.conditions;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Operating conditions</h1>

      {!conditions && (
        <p className="mt-4 text-sm text-muted-foreground">
          We do not have a live read on conditions for this one right now.
        </p>
      )}

      {conditions && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {conditions.airport} around your departure window
          </p>

          <div className="mt-5 space-y-3">
            <Row title="Airport programs" body={conditions.faa} />
            <Row title="Delays right now" body={conditions.delays} />
            <Row title="Weather at the field" body={conditions.weather} />
            {conditions.forecast && (
              <Row
                title="Forecast through your window"
                body={conditions.forecast}
                dot={pillarDot[conditions.forecastState]}
              />
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Why this matters for standby</p>
            <p className="mt-1.5 text-sm text-muted-foreground">{conditions.note}</p>
          </div>
        </>
      )}
    </main>
  );
}

function Row({ title, body, dot }: { title: string; body: string; dot?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
