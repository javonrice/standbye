import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { Screen } from "@/components/aircue/Layout";
import { CueBadge } from "@/components/aircue/CueBadge";
import { FlightHero } from "@/components/aircue/FlightHero";
import { SignalGroup, SignalLinkRow, SignalRow } from "@/components/aircue/SignalRow";
import { Button } from "@/components/ui/button";
import { useOption } from "@/lib/aircue/use-option";
import { setPrimaryOptionFn } from "@/lib/aircue/plan.functions";
import { LocalTime } from "@/components/aircue/LocalTime";
import { formatOptionArrival, formatSegmentArrival } from "@/lib/aircue/option-display";

import {
  agoLabel,
  loadIsStale,
  loadSourceLabel,
  pillarTitle,
} from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/options/$optionId/")({
  head: () => ({
    meta: [
      { title: "Option detail — Standbye" },
      {
        name: "description",
        content:
          "Why this option ranks where it does: the booking check, operating conditions, the backup runway, and any load you added.",
      },
      { property: "og:title", content: "Option detail — Standbye" },
      { property: "og:description", content: "The reasoning behind one standby option." },
    ],
  }),
  component: OptionScreen,
});

type ContextLink =
  | "/options/$optionId/context/history"
  | "/options/$optionId/context/weather"
  | "/options/$optionId/context/holiday";

function OptionScreen() {
  const { optionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useOption(optionId);
  const setPrimary = useServerFn(setPrimaryOptionFn);

  const useThisOption = useMutation({
    mutationFn: () => setPrimary({ data: { planId: data!.planId!, optionId } }),
    onSuccess: async () => {
      const planId = data!.planId!;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["option", optionId] }),
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["plans"] }),
      ]);
      void navigate({ to: "/plans/$planId", params: { planId } });
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading this option…</p>;
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="font-display text-lg font-semibold">Could not load this option</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong on our side. Try again in a moment — your plan is still there.
        </p>
        <Button asChild className="mt-4 h-11" variant="outline">
          <Link to="/plan">Back to Home</Link>
        </Button>
      </main>
    );
  }

  const option = data?.option;
  if (!option) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="font-display text-lg font-semibold">That option is gone</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Plans age out as the day moves. Build a fresh one to see current setups.
        </p>
        <Button asChild className="mt-4 h-11">
          <Link to="/plan">Plan another trip</Link>
        </Button>
      </main>
    );
  }

  const stale = loadIsStale(option.load);
  const dateLabel = formatTravelDate(data?.travelDate ?? null);
  const stops =
    option.kind === "connection" && option.segments.length > 1
      ? `${option.segments.length - 1} stop${option.segments.length > 2 ? "s" : ""} · via ${option.segments
          .slice(0, -1)
          .map((s) => s.dest)
          .join(", ")}`
      : "Nonstop";

  const pillarLink: Record<string, { to: string }> = {
    availability: { to: "/options/$optionId/availability" },
    operations: { to: "/options/$optionId/context/weather" },
    recovery: { to: "/options/$optionId/recovery" },
    history: { to: "/options/$optionId/context/history" },
  };

  const contextLinks: Array<{ to: ContextLink; label: string }> = [
    { to: "/options/$optionId/context/history", label: "Route history" },
    { to: "/options/$optionId/context/weather", label: "Weather" },
  ];
  if (option.evidence.holiday) {
    contextLinks.push({ to: "/options/$optionId/context/holiday", label: "Holiday demand" });
  }

  return (
    <Screen width="lg">
      {data?.planId && (
        <Link
          to="/plans/$planId"
          params={{ planId: data.planId }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {option.origin} → {option.dest}
        </Link>
      )}

      <header className="mt-4">
        <div className="mb-3 flex items-center gap-3">
          <AirlineLogo code={carrierFromLabel(option.flightLabel)} size={44} />
          <div className="min-w-0">
            <p className="font-display text-[19px] font-bold leading-tight tracking-tight">
              {option.flightLabel}
            </p>
            {dateLabel ? (
              <p className="text-[13px] text-muted-foreground">{dateLabel}</p>
            ) : null}
          </div>
        </div>
        <FlightHero
          origin={option.origin}
          dest={option.dest}
          depLocal={option.depLocal}
          arrLocal={formatOptionArrival(option)}
          footnote={`${stops} · all times local · checked ${agoLabel(option.refreshedAt)}`}
        />

        {option.kind === "connection" && option.segments.length > 1 && (
          <ul className="mt-4 space-y-2 text-[14px] text-muted-foreground">
            {option.segments.map((seg, idx) => (
              <li key={`${seg.flightLabel}-${seg.schedDepUtc}-${idx}`}>
                <span className="font-semibold text-foreground">{seg.flightLabel}</span>
                {" · "}
                {seg.origin} → {seg.dest}
                {" · "}
                {seg.depLocal}
                {seg.arrLocal ? (
                  <>
                    {" → "}
                    <LocalTime value={formatSegmentArrival(seg)} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-2">
          <CueBadge judgment={option.judgment} />
        </div>
      </header>

      <section className="mt-7">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Why this ranks here
        </h2>
        <div className="mt-2 rounded-2xl border border-border bg-card px-4">
          <SignalGroup>
            {option.pillars.map((p) => {
              const link = pillarLink[p.key];
              return link ? (
                <SignalLinkRow
                  key={p.key}
                  state={p.state}
                  title={pillarTitle[p.key]}
                  detail={p.label}
                  to={link.to}
                  params={{ optionId }}
                />
              ) : (
                <SignalRow
                  key={p.key}
                  state={p.state}
                  title={pillarTitle[p.key]}
                  detail={p.label}
                />
              );
            })}
          </SignalGroup>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reported load
        </h2>
        <div className="mt-2 rounded-2xl border border-border bg-card p-4">
          {option.load ? (
            <>
              <p className="text-[17px] font-semibold text-foreground">
                {option.load.openSeats ?? "—"} open
                {option.load.standbys !== null ? ` · ${option.load.standbys} listed` : ""}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {loadSourceLabel[option.load.source] ?? "Reported"} ·{" "}
                {agoLabel(option.load.checkedAt)}
                {stale ? " — worth checking again." : ""}
              </p>
            </>
          ) : (
            <p className="text-[15px] leading-snug text-muted-foreground">
              No load yet. If you can see the real numbers, Standbye will re-rank the whole plan
              around them.
            </p>
          )}
          <Link
            to="/options/$optionId/load"
            params={{ optionId }}
            className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            {option.load ? "Update load" : "Add a load"} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          More context
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {contextLinks.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              params={{ optionId }}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium"
            >
              {c.label} <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      {data?.planId && (
        <div className="mt-8">
          {data.isPrimary ? (
            <p className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-muted-foreground">
              <Check className="h-4 w-4" /> Your current plan
            </p>
          ) : (
            <Button
              className="h-12 w-full"
              disabled={useThisOption.isPending}
              onClick={() => useThisOption.mutate()}
            >
              {useThisOption.isPending ? "Saving…" : "Use this option"}
            </Button>
          )}
        </div>
      )}

      <p className="mt-5 text-xs text-muted-foreground">
        Standbye reads public booking signals and operating conditions. It is not airline load data
        and never predicts whether you will clear.
      </p>
    </Screen>
  );
}

/** "Aug 29" from a plain yyyy-mm-dd date, without timezone drift. */
function formatTravelDate(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
