import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { longDate } from "@/components/aircue/PlanView";
import { formatCountdown } from "@/lib/aircue/tz";
import { refreshWatchPlan } from "@/lib/aircue/plan.functions";
import {
  judgmentShort,
  judgmentTone,
  watchFreshness,
  type StandbyOption,
  type StandbyPlan,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/**
 * HOME = one sheet, read top to bottom: where you're going, what Standbye
 * thinks, the flight, the clock, what's still open, and two actions.
 */
export function PlanSnapshot({ plan }: { plan: StandbyPlan }) {
  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;
  const current = selected ?? recommended;

  if (!current) return <ZeroOptionHome plan={plan} />;

  const tone = judgmentTone[current.judgment];
  const otherWays = Math.max(plan.options.length - 1, 0);
  const seats = current.evidence.availability.largestShowing;

  return (
    <>
      {/* Route — the biggest thing on the screen */}
      <h1 className="flex flex-wrap items-baseline gap-x-3 font-display text-[38px] font-bold leading-none tracking-tight">
        {plan.origin} <span className="text-[30px]">→</span> {plan.dest}
        <span className="text-[19px] font-semibold text-muted-foreground">
          {dayLabel(plan.travelDate)}
        </span>
      </h1>
      <p className="mt-2.5 text-[16px] text-muted-foreground">
        {plan.travelers} traveler{plan.travelers === 1 ? "" : "s"}
      </p>

      {/* Standbye's read */}
      <p
        className={cn(
          "mt-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-[0.08em]",
          tone.bg,
          tone.text,
        )}
      >
        <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
        {judgmentShort[current.judgment]}
      </p>

      {/* The flight */}
      <div className="mt-4 flex items-center gap-3">
        <AirlineLogo code={carrierFromLabel(current.flightLabel) ?? current.carrier} size={44} />
        <p className="min-w-0 truncate font-display text-[26px] font-bold tracking-tight">
          {current.flightLabel} · {current.depLocal}
        </p>
      </div>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {current.origin} → {current.dest}
        {current.kind === "connection" ? " · 1 stop" : ""}
      </p>

      {/* The clock */}
      <p className={cn("mt-3 font-mono text-[19px] font-semibold", tone.text)}>
        <Countdown schedDepUtc={current.schedDepUtc} depLocal={current.depLocal} />
      </p>

      {typeof seats === "number" && seats > 0 && (
        <p className="mt-2 text-[15px] text-muted-foreground">
          {seats}+ seats publicly sellable
        </p>
      )}

      <WatchingRow plan={plan} otherWays={otherWays} />

      <div className="mt-5 grid gap-3">
        <Link
          to="/plans/$planId/ways"
          params={{ planId: plan.id }}
          className="flex min-h-[54px] items-center justify-center rounded-full bg-primary px-5 text-[17px] font-semibold text-primary-foreground"
        >
          See other ways
        </Link>
        <Link
          to="/plans/$planId/loads"
          params={{ planId: plan.id }}
          className="flex min-h-[54px] items-center justify-center rounded-full border border-primary/40 px-5 text-[17px] font-semibold text-primary"
        >
          Add what I see
        </Link>
      </div>

      <p className="mt-4 text-[15px] text-muted-foreground">
        What changed: <WhatChanged plan={plan} current={current} recommended={recommended} />
      </p>

      <div className="mt-4 flex items-center justify-between">
        <Link
          to="/plan"
          search={{ new: true }}
          className="text-[16px] font-semibold text-primary"
        >
          New plan
        </Link>
        <Link
          to="/plans/$planId"
          params={{ planId: plan.id }}
          className="text-[16px] font-semibold text-primary"
        >
          View my plan
        </Link>
      </div>
    </>
  );
}

/** "Today" / "Tomorrow" / "Sat, Sep 5" — the date the traveler thinks in. */
function dayLabel(travelDate: string): string {
  const d = new Date();
  const iso = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  if (travelDate === iso(d)) return "Today";
  const t = new Date(d.getTime() + 86_400_000);
  if (travelDate === iso(t)) return "Tomorrow";
  return longDate(travelDate);
}

/** One honest line about the change that matters, never invented. */
function WhatChanged({
  plan,
  current,
  recommended,
}: {
  plan: StandbyPlan;
  current: StandbyOption;
  recommended: StandbyOption | null;
}) {
  if (plan.loadResortNotice) return <>{plan.loadResortNotice.headline}</>;
  if (plan.planVerdict === "changed" && recommended && recommended.id !== current.id) {
    return <>{recommended.flightLabel} now looks stronger than {current.flightLabel}</>;
  }
  if (plan.watching) return <>Standbye is watching {current.flightLabel} at {current.depLocal}</>;
  return <>nothing yet</>;
}

/**
 * Freshness is a trust signal: never claim to be watching while the last look
 * is older than the monitoring cadence — say so and offer one tap to re-check.
 */
function WatchingRow({ plan, otherWays }: { plan: StandbyPlan; otherWays: number }) {
  const queryClient = useQueryClient();
  const recheck = useServerFn(refreshWatchPlan);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useMutation({
    mutationFn: async (watchId: string) => recheck({ data: { watchId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-plan"] });
      void queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
    },
  });

  if (!plan.watching) {
    return (
      <p className="mt-5 text-[15px] text-muted-foreground">
        Standbye isn't watching this day yet.{" "}
        <Link
          to="/plans/$planId"
          params={{ planId: plan.id }}
          className="font-semibold text-primary"
        >
          Set up monitoring
        </Link>
      </p>
    );
  }

  const { stale, checkedLabel, nextLabel } = watchFreshness(
    plan.lastCheckedAt,
    plan.nextCheckAt,
    now,
  );

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
        </span>
        <p className="text-[17px] font-bold leading-tight">Standbye is watching</p>
        {otherWays > 0 && (
          <>
            <span className="h-6 w-px bg-border" aria-hidden />
            <p className="min-w-0 truncate text-[15px] text-muted-foreground">
              {otherWays} other way{otherWays === 1 ? "" : "s"} still open
            </p>
          </>
        )}
      </div>
      <p
        className={cn(
          "mt-2 flex items-center gap-2 text-[15px]",
          stale ? "text-rough-foreground" : "text-muted-foreground",
        )}
      >
        {stale ? (
          <>{checkedLabel} · this reading may be out of date</>
        ) : (
          <>
            All quiet · {checkedLabel.toLowerCase()}
            {nextLabel ? ` · ${nextLabel}` : ""}
          </>
        )}
        {plan.watchId && stale && (
          <button
            type="button"
            onClick={() => plan.watchId && refresh.mutate(plan.watchId)}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1.5 font-semibold text-primary disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin")} aria-hidden />
            {refresh.isPending ? "Checking" : "Check now"}
          </button>
        )}
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
  const label = formatCountdown(departure, new Date(now)).replace(/^Departs in\s*/i, "");
  return <>{label} to departure</>;
}

/** A Plan is real even with zero options — show recovery, never hide it. */
function ZeroOptionHome({ plan }: { plan: StandbyPlan }) {
  return (
    <>
      <h1 className="font-display text-[38px] font-bold leading-none tracking-tight">
        {plan.origin} → {plan.dest}
      </h1>
      <p className="mt-2.5 text-[16px] text-muted-foreground">
        {dayLabel(plan.travelDate)} · {plan.travelers} traveler
        {plan.travelers === 1 ? "" : "s"}
      </p>

      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Standbye couldn't find a setup we'd recommend trying right now.
      </p>

      <div className="mt-5 grid gap-3">
        <Link
          to="/escape"
          search={{ from: plan.origin, to: plan.dest, date: plan.travelDate, planId: plan.id }}
          className="flex min-h-[54px] items-center justify-center rounded-full bg-primary px-5 text-[17px] font-semibold text-primary-foreground"
        >
          Find another way
        </Link>
        <Link
          to="/plan"
          search={{ new: true }}
          className="flex min-h-[54px] items-center justify-center rounded-full border border-primary/40 px-5 text-[17px] font-semibold text-primary"
        >
          Try another date
        </Link>
      </div>
    </>
  );
}
