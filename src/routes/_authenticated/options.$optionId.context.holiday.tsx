import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/context/holiday")({
  head: () => ({
    meta: [
      { title: "Holiday and demand context — AirCue" },
      {
        name: "description",
        content:
          "Whether your travel date lands on a holiday or a known heavy travel window, and what that usually does to standby.",
      },
      { property: "og:title", content: "Holiday and demand context — AirCue" },
      { property: "og:description", content: "Holiday pressure on your travel date." },
    ],
  }),
  component: HolidayContext,
});

function HolidayContext() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const holiday = data?.option?.evidence.holiday;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Holiday context</h1>

      {!holiday && (
        <p className="mt-4 text-sm text-muted-foreground">
          Your date does not land near a holiday we track.
        </p>
      )}

      {holiday && (
        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <p className="font-display text-lg font-semibold">{holiday.name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {holiday.date} · {holiday.country}
          </p>
          <p className="mt-3 text-sm text-foreground/90">{holiday.note}</p>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">
          Holiday windows tend to fill early and leave less room to recover, so a setup that would
          be fine in a normal week can be worth a second look.
        </p>
      </div>
    </main>
  );
}
