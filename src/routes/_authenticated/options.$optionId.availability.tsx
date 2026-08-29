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
import { agoLabel, type PillarState } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/options/$optionId/availability")({
  head: () => ({
    meta: [
      { title: "Public availability — Standbye" },
      {
        name: "description",
        content:
          "Exactly what the public booking check showed for this flight, and why it is a demand signal rather than a load.",
      },
      { property: "og:title", content: "Public availability — Standbye" },
      { property: "og:description", content: "What the public availability check found." },
    ],
  }),
  component: AvailabilityDetail,
});

function readSignal(largest: number | null): { state: PillarState; label: string } {
  if (largest === null) return { state: "unknown", label: "Public signal unclear" };
  if (largest >= 4) return { state: "good", label: "Strong public signal" };
  if (largest >= 2) return { state: "fair", label: "Softening public signal" };
  if (largest >= 1) return { state: "poor", label: "Tight public signal" };
  return { state: "poor", label: "Nothing selling publicly" };
}

function AvailabilityDetail() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const option = data?.option;
  const availability = option?.evidence.availability;
  const largest = availability?.largestShowing ?? null;
  const signal = readSignal(largest);

  return (
    <DetailShell
      optionId={optionId}
      title="Public availability"
      subtitle={option ? `${option.flightLabel} · ${option.origin} → ${option.dest}` : "Loading…"}
    >
      {availability && !availability.checked && (
        <DetailModule title="We could not check this one" className="mt-5">
          The public availability check did not return a usable answer. Standbye treats that as
          unknown — not as full.
        </DetailModule>
      )}

      {availability?.checked && (
        <>
          <DetailLead state={signal.state} label={signal.label} />

          {/* The count is the point of the screen — make it the hero. */}
          <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-center">
            <p className="font-display text-5xl font-bold tracking-tight">
              {largest === null ? "?" : largest >= 9 ? "9+" : largest}
            </p>
            <p className="mt-1.5 text-sm font-medium">
              {largest === null
                ? "Largest party still bookable is unclear"
                : `Still bookable for a party of ${largest >= 9 ? "9 or more" : largest}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Checked {agoLabel(availability.checkedAt)}
            </p>

            <div className="mt-5 border-t border-border/70 pt-4">
              <PartyScale tested={availability.tested} />
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Each dot is a party size we tried. Filled means the airline still shows a bookable
                seat at that party size.
              </p>
            </div>
          </div>

          <DetailHeading>What this means</DetailHeading>
          <DetailModule className="mt-2">
            This is what the airline is still willing to sell to the public. It moves with demand
            and revenue management, so it is an early read on whether a flight is filling up.
          </DetailModule>

          <DetailHeading>What this doesn't mean</DetailHeading>
          <DetailModule className="mt-2">
            It is not the airline's load, not your position on the standby list, and not a count of
            seats you could clear into. A real load from your employee system is stronger evidence
            and will override this.
          </DetailModule>

          <StandbyeTake className="mt-5">
            {signal.state === "good"
              ? "The airline is still selling this flight freely, which usually means the cabin has not tightened yet."
              : signal.state === "fair"
                ? "Selling has started to narrow. Worth pairing with a real load before you commit."
                : "Public selling is tight, so treat this one as a flight that is filling — a reported load matters more here."}
          </StandbyeTake>

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
