import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, RefreshCw } from "lucide-react";

import { StandbyOptionRow } from "@/components/aircue/StandbyOptionRow";
import { Button } from "@/components/ui/button";
import {
  getStandbyProfile,
  refreshWatchPlan,
  saveStandbyProfile,
  setPrimaryOptionFn,
  startWatchPlan,
} from "@/lib/aircue/plan.functions";
import { agoLabel, type StandbyPlan } from "@/lib/aircue/standby";

function useInvalidatePlan(planId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["plan", planId] });
    queryClient.invalidateQueries({ queryKey: ["watches"] });
    queryClient.invalidateQueries({ queryKey: ["plans"] });
  };
}

/** 3. Overall plan state — one quiet line under the route header. */
export function PlanStateLine({ plan }: { plan: StandbyPlan }) {
  const changed = plan.planVerdict === "changed";
  const label = changed
    ? "Something changed"
    : plan.noStrongSetup
      ? "Plan has tradeoffs"
      : "Plan looks workable";

  return (
    <p
      className={`mt-3 flex items-center gap-2 text-[13px] font-medium ${
        changed ? "text-rough-foreground" : "text-muted-foreground"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${changed ? "bg-rough" : "bg-muted-foreground/50"}`}
        aria-hidden
      />
      {label}
    </p>
  );
}

/**
 * 4. Current decision state.
 *
 * Presentation-only mapping of the existing plan payload:
 * - user-selected option  → YOUR CURRENT PLAN
 * - top-ranked option     → RECOMMENDED NOW (with "Use this option")
 */
export function PlanDecisionSection({ plan }: { plan: StandbyPlan }) {
  const invalidate = useInvalidatePlan(plan.id);
  const setPrimary = useServerFn(setPrimaryOptionFn);

  const useOption = useMutation({
    mutationFn: (optionId: string) => setPrimary({ data: { planId: plan.id, optionId } }),
    onSuccess: invalidate,
  });

  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;

  if (!selected && !recommended) return null;

  const showRecommended = recommended && (!selected || selected.id !== recommended.id);

  return (
    <>
      {selected && (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            Your current plan
          </p>
          <div className="mt-2">
            <StandbyOptionRow
              option={selected}
              rank={selected.rank}
              emphasis="primary"
              peers={plan.options}
            />
          </div>
        </section>
      )}

      {showRecommended && recommended && (
        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recommended now
          </p>
          <div className="mt-2">
            <StandbyOptionRow
              option={recommended}
              rank={recommended.rank}
              emphasis={selected ? "secondary" : "primary"}
              peers={plan.options}
            />
          </div>
          {selected && (
            <p className="mt-2 px-1 text-[13px] leading-relaxed text-muted-foreground">
              Standbye prefers this now — {recommended.headline}
            </p>
          )}
          <Button
            className="mt-3 h-12 w-full rounded-2xl text-[15px]"
            disabled={useOption.isPending}
            onClick={() => useOption.mutate(recommended.id)}
          >
            {useOption.isPending ? "Updating your plan…" : "Use this option"}
          </Button>
          {selected && (
            <p className="mt-2 text-center text-[13px] text-muted-foreground">
              Keep {selected.flightLabel}
            </p>
          )}
        </section>
      )}

      {plan.backupRunway.totalRealisticWays > 0 && (
        <section className="mt-6 px-1">
          <p className="font-display text-[17px] font-semibold tracking-tight">Backup runway</p>
          <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
            {plan.backupRunway.summary}
          </p>
        </section>
      )}

      {selected?.staffEligibility === "ineligible" && (
        <section className="mt-4 rounded-2xl border border-rough/40 bg-rough/5 px-4 py-3">
          <p className="text-[14px] font-semibold text-rough-foreground">
            This option may not be valid staff travel
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            The operating carrier looks outside your declared travel access. Standbye will never
            silently change your plan.
          </p>
        </section>
      )}

      {selected?.evidence.conditions?.faaCoverage === "not_covered" && (
        <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted-foreground">
          Live airport disruption coverage is unavailable for this region. Weather may still be
          checked.
        </p>
      )}
    </>
  );
}

/** 5. Monitoring summary — a property of the Plan, never the emotional center. */
export function PlanMonitoringSection({ plan }: { plan: StandbyPlan }) {
  const invalidate = useInvalidatePlan(plan.id);
  const begin = useServerFn(startWatchPlan);
  const refresh = useServerFn(refreshWatchPlan);

  const start = useMutation({
    mutationFn: () => begin({ data: { planId: plan.id, mode: "meaningful" } }),
    onSuccess: invalidate,
  });

  const recheck = useMutation({
    mutationFn: () => refresh({ data: { watchId: plan.watchId! } }),
    onSuccess: invalidate,
  });

  // Zero-option plans are never monitored and never show a monitoring line.
  if (plan.options.length === 0) return null;

  // Monitoring is automatic for a plan with options. If setup did not take,
  // say so quietly and let it be retried — the plan itself is unaffected.
  if (!plan.watching) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card">
        <p className="text-[14px] font-semibold">Standbye isn't watching this day yet</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Your plan is saved either way. We'll keep checking the day once monitoring is set up.
        </p>
        <button
          type="button"
          className="mt-2 text-[14px] font-semibold text-primary disabled:opacity-60"
          disabled={start.isPending}
          onClick={() => start.mutate()}
        >
          {start.isPending ? "Setting up…" : "Try again"}
        </button>
      </section>
    );
  }


  const changed = plan.planVerdict === "changed";

  return (
    <>
      <NotifyPriming />
      <section className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card">
        <p className="text-[14px] font-semibold">Standbye is watching the day.</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {changed ? "Something important changed." : "Nothing important has changed."}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-[13px] text-muted-foreground">
            Checked {agoLabel(plan.lastCheckedAt)}
          </span>
          <span className="flex items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center text-[13px] font-semibold text-muted-foreground hover:text-foreground"
              disabled={recheck.isPending}
              onClick={() => recheck.mutate()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {recheck.isPending ? "Checking…" : "Check now"}
            </button>
            {plan.watchId && (
              <Link
                to="/updates/$watchId"
                params={{ watchId: plan.watchId }}
                className="inline-flex items-center text-[13px] font-semibold text-primary"
              >
                Activity <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
              </Link>
            )}
          </span>
        </div>
      </section>
    </>
  );
}

/** 9. Changed-plan block, surfaced at the top of the Plan. */
export function PlanChangedBlock({ plan }: { plan: StandbyPlan }) {
  if (plan.planVerdict !== "changed") return null;
  const recommended =
    (plan.options.find((o) => o.id === plan.preferredOptionId) ?? plan.options[0]) ?? null;

  return (
    <section className="mt-5 rounded-2xl border border-rough/40 bg-rough/5 p-5">
      <p className="font-display text-[20px] font-bold tracking-tight">Worth another look</p>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        {recommended
          ? `${recommended.flightLabel} is now the better move. ${recommended.headline}`
          : "Today's picture moved enough to be worth a second look."}
      </p>
      {plan.watchId && (
        <Link
          to="/updates/$watchId"
          params={{ watchId: plan.watchId }}
          className="mt-3 inline-flex items-center text-[14px] font-semibold text-primary"
        >
          Review the change <ChevronRight className="ml-0.5 h-4 w-4" />
        </Link>
      )}
    </section>
  );
}

/** Shown once, the first time a plan is being watched. */
function NotifyPriming() {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStandbyProfile);
  const { data: profile } = useQuery({
    queryKey: ["standby-profile"],
    queryFn: () => getStandbyProfile(),
  });

  const optIn = useMutation({
    mutationFn: () => save({ data: { ...profile!, notifyOptin: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["standby-profile"] }),
  });

  if (!profile || profile.notifyOptin) return null;

  return (
    <section className="mt-6 rounded-2xl border border-primary/40 bg-primary/[0.06] p-5">
      <p className="font-display text-[19px] font-bold leading-tight tracking-tight">
        Standbye watches the plan, not just one flight
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Go do something else. We'll get your attention when the decision deserves another look.
      </p>
      <Button
        variant="secondary"
        className="mt-4 h-12 w-full rounded-2xl text-[15px]"
        disabled={optIn.isPending}
        onClick={() => optIn.mutate()}
      >
        Keep me updated
      </Button>
    </section>
  );
}
