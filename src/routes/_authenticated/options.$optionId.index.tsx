import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bell,
  BellOff,
  ChevronRight,
  ClipboardList,
  LifeBuoy,
} from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import { FlightHero } from "@/components/aircue/FlightHero";
import { StandbyeTake } from "@/components/aircue/StandbyeTake";
import { SignalGroup, SignalRow } from "@/components/aircue/SignalRow";
import { Button } from "@/components/ui/button";
import { useOption } from "@/lib/aircue/use-option";
import { startWatchPlan, stopWatchPlan } from "@/lib/aircue/plan.functions";
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
  const { data, isLoading } = useOption(optionId);
  const begin = useServerFn(startWatchPlan);
  const end = useServerFn(stopWatchPlan);

  const watch = useMutation({
    mutationFn: () => begin({ data: { optionId, mode: "meaningful" } }),
    onSuccess: ({ watchId }) => navigate({ to: "/watching/$watchId", params: { watchId } }),
  });

  const unwatch = useMutation({
    mutationFn: (watchId: string) => end({ data: { watchId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["option", optionId] }),
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading this cue…</p>;
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

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-3xl md:px-10 md:pt-12">
      {data?.planId && (
        <Link
          to="/plans/$planId"
          params={{ planId: data.planId }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All options
        </Link>
      )}

      <header className="mt-4">
        <CueBadge judgment={option.judgment} size="lg" />
        <FlightHero
          className="mt-5"
          eyebrow={option.flightLabel}
          origin={option.origin}
          dest={option.dest}
          depLocal={option.depLocal}
          arrLocal={option.arrLocal}
          footnote={`All times local · confidence ${confidenceLabel[
            option.confidence as Confidence
          ].toLowerCase()} · checked ${agoLabel(option.refreshedAt)}`}
        />
        <StandbyeTake className="mt-5">{option.headline}</StandbyeTake>
      </header>

      {option.load && (
        <section
          className={`mt-5 rounded-2xl border p-4 ${
            stale ? "border-watch/40 bg-watch-soft" : "border-fine/40 bg-fine-soft"
          }`}
        >
          <p className="text-sm font-semibold text-foreground">
            Your load: {option.load.openSeats ?? "—"} open
            {option.load.standbys !== null ? ` · ${option.load.standbys} listed` : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {loadSourceLabel[option.load.source] ?? "Reported"} · {agoLabel(option.load.checkedAt)}
            {stale ? " — worth refreshing before you commit." : ""}
          </p>
          <Link
            to="/options/$optionId/load"
            params={{ optionId }}
            className="mt-2 inline-block text-sm font-semibold text-primary"
          >
            Update the load
          </Link>
        </section>
      )}

      <section className="mt-7">
        <h2 className="font-display text-[19px] font-semibold tracking-tight">Why we say that</h2>
        <div className="mt-1 rounded-2xl border border-border bg-card px-4">
          <SignalGroup>
            {option.pillars.map((p) => (
              <SignalRow
                key={p.key}
                state={p.state}
                title={`${pillarTitle[p.key]} · ${p.label}`}
                detail={p.detail}
              />
            ))}
          </SignalGroup>
        </div>
      </section>

      <nav className="mt-6 space-y-2">
        <DetailLink
          to="/options/$optionId/availability"
          optionId={optionId}
          title="Availability detail"
          subtitle="What the public booking signal actually showed"
        />
        <DetailLink
          to="/options/$optionId/recovery"
          optionId={optionId}
          title="Recovery room"
          subtitle={option.evidence.recovery.summary}
        />
        <DetailLink
          to="/options/$optionId/context/history"
          optionId={optionId}
          title="How this route usually behaves"
          subtitle="Historical pattern for this month and day"
        />
        <DetailLink
          to="/options/$optionId/context/weather"
          optionId={optionId}
          title="Conditions today"
          subtitle="FAA programs, delays, and the weather picture"
        />
        {option.evidence.holiday && (
          <DetailLink
            to="/options/$optionId/context/holiday"
            optionId={optionId}
            title="Holiday context"
            subtitle={option.evidence.holiday.name}
          />
        )}
      </nav>

      <div className="mt-7 grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-12">
          <Link to="/options/$optionId/load" params={{ optionId }}>
            <ClipboardList className="mr-2 h-4 w-4" /> Add a real load
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/options/$optionId/recovery" params={{ optionId }}>
            <LifeBuoy className="mr-2 h-4 w-4" /> Backup options
          </Link>
        </Button>
      </div>

      {data?.watchId ? (
        <Button
          variant="outline"
          className="mt-2 h-12 w-full"
          disabled={unwatch.isPending}
          onClick={() => unwatch.mutate(data.watchId as string)}
        >
          <BellOff className="mr-2 h-4 w-4" /> Stop watching this plan
        </Button>
      ) : (
        <Button
          className="mt-2 h-12 w-full"
          disabled={watch.isPending}
          onClick={() => watch.mutate()}
        >
          <Bell className="mr-2 h-4 w-4" />
          {watch.isPending ? "Setting up…" : "Watch this plan"}
        </Button>
      )}

      <p className="mt-5 text-xs text-muted-foreground">
        Standbye reads public availability and operating conditions. It is not airline load data and
        never predicts whether you will clear.
      </p>
    </main>
  );
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
