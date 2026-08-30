import { Link } from "@tanstack/react-router";
import { ChevronRight, Compass, Plus } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { LocalTime } from "@/components/aircue/LocalTime";
import { longDate } from "@/components/aircue/PlanView";
import { airlineName } from "@/lib/aircue/airlines";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import {
  agoLabel,
  judgmentShort,
  judgmentTone,
  type StandbyOption,
  type StandbyPlan,
} from "@/lib/aircue/standby";
import { Button } from "@/components/ui/button";

/**
 * HOME = cockpit. A glanceable snapshot of the current Plan: route, one quiet
 * status, the current flight, monitoring, and the two day-of actions. The full
 * briefing (evidence pillars, every route, comparisons) lives on Plan Detail.
 */
export function PlanSnapshot({ plan }: { plan: StandbyPlan }) {
  const planId = plan.id;
  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;
  const current = selected ?? recommended;
  const backup = recommended && current && recommended.id !== current.id ? recommended : null;
  const changed = plan.planVerdict === "changed";

  return (
    <>
      <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight">
        {plan.origin} → {plan.dest}
      </h1>
      <p className="mt-1.5 text-[14px] text-muted-foreground">
        {longDate(plan.travelDate)} · {plan.travelers} traveler
        {plan.travelers === 1 ? "" : "s"}
      </p>

      <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />
        {plan.options.length === 0
          ? "No useful option yet"
          : plan.noStrongSetup
            ? "Plan has tradeoffs"
            : "Plan looks workable"}
      </p>

      {changed && backup && current && (
        <Link
          to="/plans/$planId"
          params={{ planId }}
          className="mt-4 flex items-center gap-3 rounded-xl bg-rough-soft px-3.5 py-2.5"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-rough-foreground">
              Better option available
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
              {current.flightLabel} → {backup.flightLabel} now looks stronger.
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-rough-foreground">Review</span>
        </Link>
      )}

      {current ? (
        <>
          <CurrentPlanCard option={current} />

          <MonitoringLine plan={plan} />

          {backup && (
            <Link
              to="/options/$optionId"
              params={{ optionId: backup.id }}
              className="mt-4 flex items-center gap-3 border-t border-border pt-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Backup
                </span>
                <span className="mt-0.5 block truncate text-[15px] font-semibold">
                  {backup.flightLabel}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  {backup.judgment === "favorable" ? "Stronger right now" : judgmentShort[backup.judgment]}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button asChild variant="secondary" className="h-11 rounded-xl text-[14px]">
              <Link to="/plans/$planId/loads" params={{ planId }}>
                <Plus className="mr-1.5 h-4 w-4" /> Add a load
              </Link>
            </Button>
            <Button asChild variant="secondary" className="h-11 rounded-xl text-[14px]">
              <Link
                to="/escape"
                search={{ from: plan.origin, to: plan.dest, date: plan.travelDate }}
              >
                <Compass className="mr-1.5 h-4 w-4" /> Another way
              </Link>
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Link
              to="/plans/$planId"
              params={{ planId }}
              className="text-[14px] font-semibold text-primary"
            >
              View full plan →
            </Link>
            <Link
              to="/plan"
              search={{ new: true }}
              className="text-[13px] font-medium text-muted-foreground"
            >
              Plan another trip
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Standbye couldn't find a setup we'd recommend trying right now.
          </p>
          <div className="mt-4 grid gap-2">
            <Button asChild className="h-12 rounded-xl">
              <Link
                to="/escape"
                search={{ from: plan.origin, to: plan.dest, date: plan.travelDate }}
              >
                Find another way
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl">
              <Link to="/plan" search={{ new: true }}>
                Try another date
              </Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** The travel object itself — the one dominant element on Home. */
function CurrentPlanCard({ option }: { option: StandbyOption }) {
  const tone = judgmentTone[option.judgment];
  const carrier = carrierFromLabel(option.flightLabel);

  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className="mt-4 block rounded-2xl border border-border bg-card px-4 py-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
          Current plan
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-2 flex items-center gap-2.5">
        <AirlineLogo code={carrier} size={26} />
        <span className="min-w-0 truncate text-[14px] font-medium text-muted-foreground">
          {carrier ? airlineName(carrier) : ""}
        </span>
      </div>
      <p className="mt-1 break-words font-display text-[19px] font-bold leading-snug tracking-tight">
        {option.flightLabel}
      </p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[22px] font-semibold leading-none tracking-tight">
            {option.depLocal}
          </p>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">{option.origin}</p>
        </div>
        <div className="mb-1 flex-1 border-t border-border" aria-hidden />
        <div className="min-w-0 text-right">
          <p className="font-display text-[22px] font-semibold leading-none tracking-tight">
            <LocalTime value={formatOptionArrival(option)} />
          </p>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">{option.dest}</p>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-muted-foreground">
        {option.kind === "connection" ? "1 stop" : "Nonstop"}
      </p>

      <p className={`mt-3 text-[14px] font-semibold ${tone.text}`}>
        {judgmentShort[option.judgment]} right now
      </p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{option.headline}</p>
    </Link>
  );
}

/** Almost invisible while everything is normal. */
function MonitoringLine({ plan }: { plan: StandbyPlan }) {
  if (plan.options.length === 0) return null;

  if (!plan.watching) {
    return (
      <p className="mt-3 text-[13px] text-muted-foreground">
        Standbye isn't watching this day yet.{" "}
        <Link to="/plans/$planId" params={{ planId: plan.id }} className="font-semibold text-primary">
          Set up monitoring
        </Link>
      </p>
    );
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-[13px] text-muted-foreground">
        Standbye is watching the day · checked {agoLabel(plan.lastCheckedAt)}
      </p>
      {plan.watchId && (
        <Link
          to="/updates/$watchId"
          params={{ watchId: plan.watchId }}
          className="shrink-0 text-[13px] font-semibold text-primary"
        >
          Activity →
        </Link>
      )}
    </div>
  );
}
