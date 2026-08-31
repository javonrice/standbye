import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Compass, Plus } from "lucide-react";

import { LocalTime } from "@/components/aircue/LocalTime";
import { longDate } from "@/components/aircue/PlanView";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import { formatCountdown } from "@/lib/aircue/tz";
import {
  agoLabel,
  judgmentShort,
  judgmentTone,
  type StandbyOption,
  type StandbyPlan,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/**
 * HOME = cockpit. One dominant active-trip card — flight, countdown, route,
 * facts, monitoring, and the main CTA as a single object — plus two quick
 * actions. The full briefing (evidence pillars, every route) lives on
 * Plan Detail.
 */
export function PlanSnapshot({ plan }: { plan: StandbyPlan }) {
  const planId = plan.id;
  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;
  const current = selected ?? recommended;
  const changed = plan.planVerdict === "changed";

  if (!current) {
    return <ZeroOptionHome plan={plan} />;
  }

  return (
    <>
      <h1 className="sr-only">
        {plan.origin} to {plan.dest} on {longDate(plan.travelDate)}
      </h1>

      {changed && recommended && recommended.id !== current.id && (
        <Link
          to="/plans/$planId"
          params={{ planId }}
          className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-rough-soft px-3.5 py-2.5"
        >
          <span className="min-w-0 text-[13px] font-semibold text-rough-foreground">
            Better option available — {recommended.flightLabel} now looks stronger.
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-rough-foreground">Review</span>
        </Link>
      )}

      <ActiveTripCard plan={plan} option={current} selected={!!selected} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          to="/plans/$planId/loads"
          params={{ planId }}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-[13px] font-semibold shadow-card"
        >
          <Plus className="h-5 w-5 text-primary" />
          Add load
        </Link>
        <Link
          to="/escape"
          search={{ from: plan.origin, to: plan.dest, date: plan.travelDate, planId: plan.id }}
          className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card py-3 text-[13px] font-semibold shadow-card"
        >
          <Compass className="h-5 w-5 text-primary" />
          Find another way
        </Link>
      </div>
    </>
  );
}

/** The one dominant object: the entire standby day compressed into a card. */
function ActiveTripCard({
  plan,
  option,
  selected,
}: {
  plan: StandbyPlan;
  option: StandbyOption;
  selected: boolean;
}) {
  const tone = judgmentTone[option.judgment];
  const backups = Math.max(plan.options.length - 1, 0);

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      {/* Flight + status */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
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

      {/* Countdown — the context that matters most */}
      <p className="px-5 pt-2 font-display text-[30px] font-bold leading-tight tracking-tight">
        <Countdown schedDepUtc={option.schedDepUtc} depLocal={option.depLocal} />
      </p>

      {/* Route */}
      <div className="flex items-center gap-2 px-5 pt-2 text-[17px] font-semibold tracking-tight">
        <span>{option.origin}</span>
        <span className="mx-1 flex-1 border-t border-border" aria-hidden />
        <span>
          <LocalTime value={formatOptionArrival(option)} className="text-muted-foreground" />
        </span>
        <span>{option.dest}</span>
      </div>
      <p className="px-5 pt-1 text-[13px] font-medium text-muted-foreground">
        {longDate(plan.travelDate)} · {plan.travelers} traveler
        {plan.travelers === 1 ? "" : "s"}
        {!selected && " · Recommended now"}
      </p>

      {/* Key facts */}
      <div className="mt-4 grid grid-cols-3 border-t border-border px-5 py-3">
        <Fact label="Departs" value={option.depLocal} />
        <Fact label="Route" value={option.kind === "connection" ? "1 stop" : "Nonstop"} />
        <Fact label="Backups" value={backups === 0 ? "None" : `${backups}`} />
      </div>

      {/* Monitoring — quiet unless attention is needed */}
      <div className="border-t border-border px-5 py-3">
        {plan.watching ? (
          <p className="text-[13px] text-muted-foreground">
            Standbye is watching · checked {agoLabel(plan.lastCheckedAt)}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Standbye isn't watching this day yet.{" "}
            <Link
              to="/plans/$planId"
              params={{ planId: plan.id }}
              className="font-semibold text-primary"
            >
              Set up monitoring
            </Link>
          </p>
        )}
      </div>

      {/* Main CTA */}
      <Link
        to="/plans/$planId"
        params={{ planId: plan.id }}
        className="block border-t border-border bg-primary px-5 py-3.5 text-center text-[15px] font-bold tracking-wide text-primary-foreground"
      >
        View my plan
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[15px] font-semibold tracking-tight">
        <LocalTime value={value} />
      </p>
    </div>
  );
}

/** Live countdown, ticking each minute; falls back to the scheduled time. */
function Countdown({
  schedDepUtc,
  depLocal,
}: {
  schedDepUtc: string | null;
  depLocal: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!schedDepUtc) return <>Departs {depLocal}</>;
  const departure = new Date(schedDepUtc);
  if (Number.isNaN(departure.getTime())) return <>Departs {depLocal}</>;
  if (departure.getTime() - now <= 0) return <>Departure time has passed</>;
  return <>{formatCountdown(departure, new Date(now))}</>;
}

/** A Plan is real even with zero options — show recovery, never hide it. */
function ZeroOptionHome({ plan }: { plan: StandbyPlan }) {
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
        No useful option yet
      </p>

      <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-card">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Standbye couldn't find a setup we'd recommend trying right now.
        </p>
        <div className="mt-4 grid gap-2">
          <Link
            to="/escape"
            search={{ from: plan.origin, to: plan.dest, date: plan.travelDate, planId: plan.id }}
            className="block rounded-xl bg-primary px-4 py-3 text-center text-[15px] font-semibold text-primary-foreground"
          >
            Find another way
          </Link>
          <Link
            to="/plan"
            search={{ new: true }}
            className="block rounded-xl border border-border px-4 py-3 text-center text-[15px] font-semibold"
          >
            Try another date
          </Link>
        </div>
      </div>
    </>
  );
}
