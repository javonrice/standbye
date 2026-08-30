import { createFileRoute, Link } from "@tanstack/react-router";

import {
  DetailHeading,
  DetailLead,
  DetailModule,
  DetailShell,
  PartyScale,
} from "@/components/aircue/DetailScreen";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { useOption } from "@/lib/aircue/use-option";
import { agoLabel } from "@/lib/aircue/standby";
import {
  publicBookingPresentation,
  publicBookingTake,
} from "@/lib/aircue/public-booking-presentation";

export const Route = createFileRoute("/_authenticated/options/$optionId/availability")({
  head: () => ({
    meta: [
      { title: "Public booking — Standbye" },
      {
        name: "description",
        content:
          "How large a party the public booking flow still shows as bookable for this flight — a commercial signal, not airline load.",
      },
      { property: "og:title", content: "Public booking — Standbye" },
      { property: "og:description", content: "What the public booking check found." },
    ],
  }),
  component: AvailabilityDetail,
});

function AvailabilityDetail() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const option = data?.option;
  const availability = option?.evidence.availability;
  const largest = availability?.largestShowing ?? null;
  const checked = Boolean(availability?.checked);
  const signal = publicBookingPresentation({
    largestShowing: largest,
    checked: availability ? availability.checked : false,
  });

  return (
    <DetailShell
      optionId={optionId}
      title="Public booking"
      subtitle={option ? `${option.flightLabel} · ${option.origin} → ${option.dest}` : "Loading…"}
    >
      {availability && !availability.checked && (
        <DetailModule title="We could not check this one" className="mt-5">
          The public booking check did not return a usable answer. Standbye treats that as unknown —
          not as full.
        </DetailModule>
      )}

      {availability?.checked && (
        <>
          <DetailLead state={signalState(largest)} label={signal.label} />

          <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-center">
            <p className="font-display text-5xl font-bold tracking-tight">
              {largest === null ? "?" : largest >= 4 ? "4+" : largest}
            </p>
            <p className="mt-1.5 text-sm font-medium">
              {largest === null
                ? "Largest party still bookable is unclear"
                : largest >= 4
                  ? "Public booking still shows for a party of 4"
                  : `Public booking still shows for a party of ${largest}`}
            </p>
            {largest !== null && largest >= 4 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Standbye currently checks up to 4 travelers. So 4+ means the check reached our
                current ceiling — not that four or more physical seats are open.
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Checked {agoLabel(availability.checkedAt)}
            </p>

            <div className="mt-5 border-t border-border/70 pt-4">
              <PartyScale tested={availability.tested} />
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Each dot is a party size Standbye checked. Filled means that party size still
                appeared bookable.
              </p>
            </div>
          </div>

          <DetailHeading>What this means</DetailHeading>
          <DetailModule className="mt-2">
            This is a commercial booking signal. It tells Standbye how open or constrained public
            selling appears right now. Changes over time can show public booking tightening or
            loosening.
          </DetailModule>

          <DetailHeading>What this doesn&apos;t mean</DetailHeading>
          <DetailModule className="mt-2">
            It is not the airline&apos;s load, not your standby-list position, and not a count of
            seats you could clear into. A complete reported load is stronger evidence and can
            replace this signal in the Plan.
          </DetailModule>

          <StandbyeTake className="mt-5">{publicBookingTake(largest, checked)}</StandbyeTake>

          <Link
            to="/options/$optionId/load"
            params={{ optionId }}
            className="mt-4 inline-block text-sm font-semibold text-primary"
          >
            Add a real load instead
          </Link>
        </>
      )}
    </DetailShell>
  );
}

/** Map largestShowing to a lead tone without inventing seats language. */
function signalState(largest: number | null) {
  if (largest === null) return "unknown" as const;
  if (largest >= 4) return "good" as const;
  if (largest >= 1) return "fair" as const;
  return "poor" as const;
}
