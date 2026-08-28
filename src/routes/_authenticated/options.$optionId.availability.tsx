import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, X } from "lucide-react";

import { useOption } from "@/lib/aircue/use-option";
import { agoLabel } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/options/$optionId/availability")({
  head: () => ({
    meta: [
      { title: "Availability detail — AirCue" },
      {
        name: "description",
        content:
          "Exactly what the public booking check showed for this flight, and why it is a demand signal rather than a load.",
      },
      { property: "og:title", content: "Availability detail — AirCue" },
      { property: "og:description", content: "What the public availability check found." },
    ],
  }),
  component: AvailabilityDetail,
});

function AvailabilityDetail() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const option = data?.option;
  const availability = option?.evidence.availability;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Availability detail</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {option ? `${option.flightLabel} · ${option.origin} → ${option.dest}` : "Loading…"}
      </p>

      {availability && !availability.checked && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">We could not check this one</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The public availability check did not return a usable answer. AirCue treats that as
            unknown — not as full.
          </p>
        </div>
      )}

      {availability?.checked && (
        <>
          <div className="mt-5 rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Largest party still bookable</p>
            <p className="font-display text-3xl font-bold">
              {availability.largestShowing === null
                ? "—"
                : availability.largestShowing >= 9
                  ? "9+"
                  : availability.largestShowing}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Checked {agoLabel(availability.checkedAt)}
            </p>
          </div>

          <ul className="mt-4 space-y-1.5">
            {availability.tested.map((t) => (
              <li
                key={t.adults}
                className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
              >
                <span>Party of {t.adults}</span>
                <span
                  className={`flex items-center gap-1.5 font-semibold ${
                    t.showing ? "text-fine-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t.showing ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  {t.showing ? "Still selling" : "Not selling"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold">What this is — and is not</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This is what the airline is still willing to sell publicly. It moves with demand and
          revenue management, so it is a useful early signal that a flight is filling up. It is not
          the airline's load, not your standby list position, and not a seat prediction. A real
          load from your employee system is stronger evidence and will override this.
        </p>
        <Link
          to="/options/$optionId/load"
          params={{ optionId }}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Add a real load instead
        </Link>
      </div>
    </main>
  );
}
