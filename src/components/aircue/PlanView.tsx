import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarRange, GitCompareArrows } from "lucide-react";

import { FirstUseTeaching } from "@/components/aircue/FirstUseTeaching";
import { LocalTime } from "@/components/aircue/LocalTime";
import {
  PlanChangedBlock,
  PlanDecisionSection,
  PlanMonitoringSection,
  PlanStateLine,
} from "@/components/aircue/PlanDetailSections";
import { RouteOptionRow } from "@/components/aircue/RouteOptionRow";
import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { Button } from "@/components/ui/button";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import {
  judgmentShort,
  judgmentTone,
  type StandbyOption,
  type StandbyPlan,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/**
 * PLAN DETAIL = the full briefing. It opens with the same unified trip object
 * the Home snapshot uses, so the two never feel like different products, then
 * keeps going where Home stops: why this ranks here, backups, every route and
 * the activity behind the plan.
 */
export function PlanView({ plan }: { plan: StandbyPlan }) {
  const planId = plan.id;
  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;
  const current = selected ?? recommended;

  return (
    <>
      {/* 1–3. One trip object: route, date, travelers, plan state */}
      <TripBriefCard plan={plan} option={current} selected={!!selected} />


      {plan.options.length === 0 ? (
        <ZeroOptionState plan={plan} />
      ) : (
        <>
          {/* 9. Change surfaced on the plan itself */}
          <PlanChangedBlock plan={plan} />

          {plan.loadResortNotice && (
            <section className="mt-5 rounded-2xl border border-primary/40 bg-primary/[0.06] p-5">
              <p className="font-display text-[20px] font-bold tracking-tight">
                {plan.loadResortNotice.headline}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                {plan.loadResortNotice.detail}
              </p>
            </section>
          )}

          {/* 4. Current decision state */}
          <PlanDecisionSection plan={plan} />

          {/* 5. Monitoring summary */}
          <PlanMonitoringSection plan={plan} />

          <FirstUseTeaching />

          {/* 6. Backup options */}
          <BackupOptions plan={plan} />

          {/* 7. Plan actions */}
          <h2 className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Your plan
          </h2>
          <div className="mt-3 space-y-2.5">
            <ActionRow
              to="/plans/$planId/loads"
              params={{ planId }}
              title="Add load information"
              body="Screenshot or enter open seats — Standbye re-scores the whole plan."
              emphasis
            />
            <ActionRow
              to="/escape"
              search={{ from: plan.origin, to: plan.dest, date: plan.travelDate, planId: plan.id }}
              title="Find another way"
              body="Unconventional but realistic ways to still get there."
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {plan.options.length > 1 && (
              <Button asChild variant="outline" className="h-11">
                <Link to="/plans/$planId/compare" params={{ planId }}>
                  <GitCompareArrows className="mr-2 h-4 w-4" /> Compare options
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="h-11">
              <Link to="/plan" search={{ new: true }}>
                <CalendarRange className="mr-2 h-4 w-4" /> Plan another trip
              </Link>
            </Button>
          </div>

          {/* 8. Every route */}
          {plan.gateways.length > 0 && (
            <section className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[19px] font-semibold tracking-tight">
                  Every route
                </h2>
                <Link
                  to="/plans/$planId/ways"
                  params={{ planId }}
                  className="text-[14px] font-semibold text-primary"
                >
                  See every route
                </Link>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Getting to {plan.dest} today is a strategy, not one flight.
              </p>
              <div className="mt-3 space-y-3">
                {plan.gateways.slice(0, 3).map((gateway) => (
                  <RouteOptionRow key={gateway.hub} gateway={gateway} />
                ))}
              </div>
            </section>
          )}

          {/* 10. Activity */}
          {plan.watchId && (
            <Link
              to="/updates/$watchId"
              params={{ watchId: plan.watchId }}
              className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5"
            >
              <span className="text-[14px] font-semibold">Activity on this plan</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          )}
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Public booking checks are a demand signal, not airline load. Standbye never predicts whether
        you will clear.
      </p>
    </>
  );
}

/**
 * The briefing header. Same unified trip object as the Home snapshot — one
 * card, flight and status together — but tuned for reading rather than
 * glancing: the route leads, there is no countdown and no "View my plan" CTA,
 * because you are already here.
 */
function TripBriefCard({
  plan,
  option,
  selected,
}: {
  plan: StandbyPlan;
  option: StandbyOption | null;
  selected: boolean;
}) {
  const tone = option ? judgmentTone[option.judgment] : null;

  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="px-5 pt-4">
        <h1 className="font-display text-[30px] font-bold leading-none tracking-tight">
          {plan.origin} → {plan.dest}
        </h1>
        <p className="mt-2 text-[14px] font-medium text-muted-foreground">
          {longDate(plan.travelDate)} · {plan.travelers} traveler
          {plan.travelers === 1 ? "" : "s"}
        </p>
        <PlanStateLine plan={plan} />
      </div>

      {option && tone && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border px-5 pt-3">
            <p className="min-w-0 truncate text-[15px] font-bold tracking-tight">
              {option.flightLabel}
            </p>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]",
                tone.bg,
                tone.text,
              )}
            >
              {judgmentShort[option.judgment]}
            </span>
          </div>
          <p className="px-5 pt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {selected ? "Your current plan" : "Recommended now"}
          </p>
          <div className="grid grid-cols-3 px-5 pb-4 pt-3">
            <Fact label="Departs" value={option.depLocal} />
            <Fact label="Arrives" value={formatOptionArrival(option)} />
            <Fact
              label="Route"
              value={option.kind === "connection" ? "1 stop" : "Nonstop"}
              plain
            />
          </div>
        </>
      )}
    </div>
  );
}

function Fact({ label, value, plain }: { label: string; value: string; plain?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight">
        {plain ? value : <LocalTime value={value} />}
      </p>
    </div>
  );
}



function BackupOptions({ plan }: { plan: StandbyPlan }) {
  const shownId = plan.primaryOptionId ?? plan.preferredOptionId ?? plan.options[0]?.id;
  const recommendedId = plan.preferredOptionId ?? plan.options[0]?.id;
  const backups = plan.options.filter((o) => o.id !== shownId && o.id !== recommendedId);
  if (backups.length === 0) return null;

  return (
    <section className="mt-7">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Backup options
      </h2>
      <ul className="mt-3 space-y-2.5">
        {backups.map((option) => (
          <li key={option.id}>
            <StandbyOptionRow
              option={option}
              rank={option.rank}
              emphasis="secondary"
              peers={plan.options}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ZeroOptionState({ plan }: { plan: StandbyPlan }) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <p className="font-display text-[20px] font-semibold tracking-tight">
        {emptyTitle(plan.emptyReason)}
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {emptyBody(plan.emptyReason, plan.origin, plan.dest)}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button asChild className="h-11">
          <Link to="/escape" search={{ from: plan.origin, to: plan.dest, date: plan.travelDate, planId: plan.id }}>
            Find another way
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11">
          <Link to="/plan" search={{ new: true }}>
            Try another date
          </Link>
        </Button>
      </div>
    </div>
  );
}

interface ActionRowProps {
  to: "/plans/$planId/loads" | "/escape";
  params?: { planId: string };
  search?: { from: string; to: string; date: string; planId: string };
  title: string;
  body: string;
  emphasis?: boolean;
}

function ActionRow({ to, params, search, title, body, emphasis }: ActionRowProps) {
  const className = `flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 ${
    emphasis ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-card shadow-card"
  }`;
  const inner = (
    <>
      <span className="text-left">
        <span className="block text-[14px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12px] text-muted-foreground">{body}</span>
      </span>
      <ArrowRight
        className={`h-4 w-4 shrink-0 ${emphasis ? "text-primary" : "text-muted-foreground"}`}
      />
    </>
  );

  return to === "/escape" ? (
    <Link to="/escape" search={search!} className={className}>
      {inner}
    </Link>
  ) : (
    <Link to="/plans/$planId/loads" params={params!} className={className}>
      {inner}
    </Link>
  );
}

type EmptyReason = "no_service" | "day_over" | "carrier_filter" | "data_unavailable" | null;

function emptyTitle(reason: EmptyReason): string {
  if (reason === "day_over") return "The useful part of this day is behind you";
  if (reason === "carrier_filter") return "Your airline filter is too narrow";
  if (reason === "data_unavailable") return "We could not check flights right now";
  return "No useful option yet";
}

function emptyBody(reason: EmptyReason, origin: string, dest: string): string {
  if (reason === "day_over")
    return `The remaining ${origin} → ${dest} departures have already gone or are too close to be worth planning around.`;
  if (reason === "carrier_filter")
    return "There are flights on this route, but none from the airlines you selected.";
  if (reason === "data_unavailable")
    return "Live flight data did not come back for this search. Try again in a few minutes.";
  return "Standbye couldn't find a setup we'd recommend trying right now.";
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
