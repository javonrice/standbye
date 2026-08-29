import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ChevronRight,
  LifeBuoy,
  Star,
} from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { Screen } from "@/components/aircue/Layout";
import { CueBadge } from "@/components/aircue/CueBadge";
import { FlightHero } from "@/components/aircue/FlightHero";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { SignalGroup, SignalLinkRow, SignalRow } from "@/components/aircue/SignalRow";
import { Button } from "@/components/ui/button";
import { useOption } from "@/lib/aircue/use-option";
import { setPrimaryOptionFn } from "@/lib/aircue/plan.functions";
import { formatOptionArrival, formatSegmentArrival } from "@/lib/aircue/option-display";
import {
  agoLabel,
  confidenceLabel,
  loadIsStale,
  loadSourceLabel,
  pillarTitle,
  type Confidence,
} from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/options/$optionId/")({
  head: () => ({
    meta: [
      { title: "Standby cue — Standbye" },
      {
        name: "description",
        content:
          "Why this standby setup looks the way it does: availability, operations, history, and the backup options you would still have.",
      },
      { property: "og:title", content: "Standby cue — Standbye" },
      { property: "og:description", content: "The reasoning behind one standby option." },
    ],
  }),
  component: CueScreen,
});

function CueScreen() {
  const { optionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useOption(optionId);
  const setPrimary = useServerFn(setPrimaryOptionFn);

  const makePrimary = useMutation({
    mutationFn: () =>
      setPrimary({ data: { planId: data!.planId!, optionId } }),
    onSuccess: async () => {
      const planId = data!.planId!;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["option", optionId] }),
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["committed-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-searches"] }),
      ]);
      void navigate({ to: "/plans/$planId", params: { planId } });
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading this cue…</p>;
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
          <Link to="/plan">Start a new plan</Link>
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

  return (
    <Screen width="lg">
      {data?.planId && (
        <Link
          to="/plans/$planId"
          params={{ planId: data.planId }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to plan
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CueBadge judgment={option.judgment} />
          <span className="text-[13px] text-muted-foreground">
            Confidence: {confidenceLabel[option.confidence as Confidence]}
          </span>
        </div>
      </header>

      {option.load && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Reported load
          </p>
          <p className="mt-1.5 text-[17px] font-semibold text-foreground">
            {option.load.openSeats ?? "—"} open
            {option.load.standbys !== null ? ` · ${option.load.standbys} listed` : ""}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {loadSourceLabel[option.load.source] ?? "Reported"} · {agoLabel(option.load.checkedAt)}
            {stale ? " — worth refreshing before you commit." : ""}
          </p>
          <Link
            to="/options/$optionId/load"
            params={{ optionId }}
            className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            Update load <ChevronRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      <section className="mt-7">
        <h2 className="font-display text-[19px] font-semibold tracking-tight">
          Why Standbye says this
        </h2>
        <div className="mt-1 rounded-2xl border border-border bg-card px-4">
          <SignalGroup>
            {option.pillars.map((p) => {
              const link = pillarLink[p.key];
              return link ? (
                <SignalLinkRow
                  key={p.key}
                  state={p.state}
                  title={pillarTitle[p.key]}
                  detail={`${p.label} — ${p.detail}`}
                  to={link.to}
                  params={{ optionId }}
                />
              ) : (
                <SignalRow
                  key={p.key}
                  state={p.state}
                  title={pillarTitle[p.key]}
                  detail={`${p.label} — ${p.detail}`}
                />
              );
            })}
          </SignalGroup>
        </div>
        {option.evidence.holiday && (
          <Link
            to="/options/$optionId/context/holiday"
            params={{ optionId }}
            className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Holiday context</span>
              <span className="block truncate text-xs text-muted-foreground">
                {option.evidence.holiday.name}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        )}
      </section>

      <StandbyeTake className="mt-6">{option.headline}</StandbyeTake>

      <div className="mt-6 space-y-2">
        {data?.planId && (
          data.isPrimary ? (
            <p className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 text-sm font-semibold text-muted-foreground">
              <Star className="h-4 w-4" /> Your primary option
            </p>
          ) : (
            <Button
              className="h-12 w-full"
              disabled={makePrimary.isPending}
              onClick={() => makePrimary.mutate()}
            >
              <Star className="mr-2 h-4 w-4" />
              {makePrimary.isPending ? "Saving…" : "Make this my primary option"}
            </Button>
          )
        )}
        <Button asChild variant="outline" className="h-12 w-full">
          <Link to="/options/$optionId/recovery" params={{ optionId }}>
            <LifeBuoy className="mr-2 h-4 w-4" /> See backup options
          </Link>
        </Button>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Standbye reads public availability and operating conditions. It is not airline load data and
        never predicts whether you will clear.
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

function DetailLink({
  to,
  optionId,
  title,
  subtitle,
}: {
  to:
    | "/options/$optionId/availability"
    | "/options/$optionId/recovery"
    | "/options/$optionId/context/history"
    | "/options/$optionId/context/weather"
    | "/options/$optionId/context/holiday";
  optionId: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      params={{ optionId }}
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
