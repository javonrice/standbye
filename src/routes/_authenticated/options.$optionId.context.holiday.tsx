import { createFileRoute } from "@tanstack/react-router";

import { DetailModule, DetailShell } from "@/components/aircue/DetailScreen";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/context/holiday")({
  head: () => ({
    meta: [
      { title: "Holiday and demand context — Standbye" },
      {
        name: "description",
        content:
          "Whether your travel date lands on a holiday or a known heavy travel window, and what that usually does to standby.",
      },
      { property: "og:title", content: "Holiday and demand context — Standbye" },
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
    <DetailShell
      optionId={optionId}
      title="Holiday context"
      subtitle={holiday ? `${holiday.name} · ${holiday.date}` : undefined}
    >
      {!holiday && (
        <p className="mt-5 text-sm text-muted-foreground">
          Your date does not land near a holiday we track.
        </p>
      )}

      {holiday && (
        <>
          <DetailModule className="mt-5">{holiday.note}</DetailModule>

          <StandbyeTake className="mt-4">
            Holiday windows fill early and leave less room to recover, so a setup that would be fine
            in a normal week is worth a second look on this date.
          </StandbyeTake>
        </>
      )}
    </DetailShell>
  );
}
