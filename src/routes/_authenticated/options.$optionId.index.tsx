import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { CueBadge } from "@/components/aircue/CueBadge";
import { LocalTime } from "@/components/aircue/LocalTime";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useOption } from "@/lib/aircue/use-option";
import { setPrimaryOptionFn } from "@/lib/aircue/plan.functions";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import { agoLabel, loadSourceLabel, type PillarState } from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

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

const pillarStateText: Record<PillarState, string> = {
  good: "text-emerald-600",
  fair: "text-amber-600",
  poor: "text-rose-600",
  unknown: "text-muted-foreground",
};

const v2PillarTitle: Record<string, string> = {
  availability: "Booking check",
  operations: "Operations",
  recovery: "Backup runway",
  history: "History",
};

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

  const dateLabel = formatTravelDate(data?.travelDate ?? null);
  const stops =
    option.kind === "connection" && option.segments.length > 1
      ? `${option.segments.length - 1} stop${option.segments.length > 2 ? "s" : ""} · via ${option.segments
          .slice(0, -1)
          .map((s) => s.dest)
          .join(", ")}`
      : "Nonstop";

  const availability = option.evidence.availability;
  const seatsLine = !availability.checked
    ? "Booking check not run yet"
    : availability.largestShowing
      ? `${availability.largestShowing}+ seats publicly sellable`
      : "No public seats showing";

  const conditions = option.evidence.conditions;
  const holiday = option.evidence.holiday;
  const liveStatus = option.segments[0]?.status ?? null;

  return (
    <main className="min-h-dvh bg-muted/40 pb-28">
      {/* Sticky header — back to the plan, route as the title. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        {data?.planId ? (
          <Link
            to="/plans/$planId"
            params={{ planId: data.planId }}
            aria-label="Back to plan"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="h-9 w-9" />
        )}
        <p className="flex-1 text-center text-[15px] font-semibold">
          {option.origin} → {option.dest}
        </p>
        <span className="h-9 w-9" />
      </header>

      <div className="mx-auto max-w-md px-5">
        {/* Hero */}
        <section className="pt-5">
          <div className="flex items-center gap-3">
            <AirlineLogo code={carrierFromLabel(option.flightLabel)} size={40} />
            <h1 className="font-display text-[38px] font-bold leading-none tracking-tight">
              {option.flightLabel}
            </h1>
          </div>

          {dateLabel ? (
            <p className="mt-3 text-[14px] text-muted-foreground">{dateLabel}</p>
          ) : null}
          <p className="mt-1 font-display text-[20px] font-semibold tracking-tight">
            {option.origin} → {option.dest}
          </p>

          <div className="mt-5 space-y-4">
            <TimeRow code={option.origin} time={option.depLocal} label="Departs" />
            <TimeRow code={option.dest} time={formatOptionArrival(option)} label="Arrives" />
          </div>

          <p className="mt-4 text-[13px] text-muted-foreground">{stops} · all times local</p>
          <p className="text-[13px] text-muted-foreground">
            {availability.checkedAt
              ? `Checked ${agoLabel(availability.checkedAt)}`
              : "Not checked yet"}
          </p>
          {liveStatus ? (
            <p className="text-[13px] font-medium text-emerald-600">{liveStatus}</p>
          ) : null}

          <div className="mt-4">
            <CueBadge judgment={option.judgment} />
          </div>
          <p className="mt-2 text-[14px] text-muted-foreground">{seatsLine}</p>
        </section>

        {/* Seats */}
        <SectionLabel>Seats</SectionLabel>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <AirlineLogo code={carrierFromLabel(option.flightLabel)} size={28} />
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">
                {option.origin} → {option.dest}
              </p>
              <p className="text-[17px] font-semibold leading-tight">{option.flightLabel}</p>
            </div>
          </div>

          {option.load ? (
            <>
              <p className="mt-3 text-[17px] font-semibold">
                {option.load.openSeats ?? "—"} open
                {option.load.standbys !== null ? ` · ${option.load.standbys} listed` : ""}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {loadSourceLabel[option.load.source] ?? "Reported"} ·{" "}
                {agoLabel(option.load.checkedAt)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-[17px] font-semibold">{seatsLine}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Publicly sellable on Google Flights
              </p>
            </>
          )}

          <Button asChild variant="outline" className="mt-4 h-12 w-full text-primary">
            <Link to="/options/$optionId/load" params={{ optionId }}>
              {option.load ? "Update the load" : "Add a load"}
            </Link>
          </Button>
        </div>

        {/* Why this ranks here */}
        <SectionLabel>Why this ranks here</SectionLabel>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4">
          {option.pillars.map((p) => (
            <div key={p.key} className="flex items-start gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight">
                  {v2PillarTitle[p.key] ?? p.key}
                </p>
                <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{p.detail}</p>
              </div>
              <p className={cn("text-[14px] font-semibold", pillarStateText[p.state])}>
                {p.label}
              </p>
            </div>
          ))}
        </div>

        {/* More context */}
        <SectionLabel>More context</SectionLabel>
        <Accordion
          type="single"
          collapsible
          className="divide-y divide-border rounded-2xl border border-border bg-card px-4"
        >
          {conditions ? (
            <AccordionItem value="conditions" className="border-0">
              <AccordionTrigger className="py-3.5 hover:no-underline">
                <div className="text-left">
                  <p className="text-[15px] font-semibold leading-tight">Operations & weather</p>
                  <p className="mt-1 text-[13px] font-normal text-muted-foreground">
                    {conditions.airport} {conditions.weather}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-[14px] leading-snug text-muted-foreground">
                <p>{conditions.note}</p>
                <p className="mt-1">FAA: {conditions.faa}</p>
                <p>Delays: {conditions.delays}</p>
                {conditions.forecast ? <p className="mt-1">{conditions.forecast}</p> : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          {holiday ? (
            <AccordionItem value="holiday" className="border-0">
              <AccordionTrigger className="py-3.5 hover:no-underline">
                <div className="text-left">
                  <p className="text-[15px] font-semibold leading-tight">Holiday near trip</p>
                  <p className="mt-1 text-[13px] font-normal text-muted-foreground">
                    {holiday.name}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-[14px] leading-snug text-muted-foreground">
                {holiday.note}
              </AccordionContent>
            </AccordionItem>
          ) : null}

          <AccordionItem value="status" className="border-0">
            <AccordionTrigger className="py-3.5 hover:no-underline">
              <div className="text-left">
                <p className="text-[15px] font-semibold leading-tight">Live flight status</p>
                <p className="mt-1 text-[13px] font-normal text-muted-foreground">
                  {liveStatus ?? "No status published yet"}
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-[14px] leading-snug text-muted-foreground">
              <p>
                {option.flightLabel} · {option.origin} <LocalTime value={option.depLocal} /> →{" "}
                {option.dest} <LocalTime value={formatOptionArrival(option)} />
              </p>
              <p className="mt-1">Refreshed {agoLabel(option.refreshedAt)}.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <p className="mt-6 text-xs text-muted-foreground">
          Standbye reads public booking signals and operating conditions. It is not airline load
          data and never predicts whether you will clear.
        </p>
      </div>

      {/* Commit bar */}
      {data?.planId && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-md">
            {data.isPrimary ? (
              <p className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
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
        </div>
      )}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

function TimeRow({
  code,
  time,
  label,
}: {
  code: string;
  time: string | null | undefined;
  label: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <p className="font-display text-[22px] font-bold tracking-tight text-muted-foreground">
        {code}
      </p>
      <div>
        <p className="font-display text-[22px] font-bold leading-none tracking-tight">
          <LocalTime value={time} />
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** "Today" / "Aug 29" from a plain yyyy-mm-dd date, without timezone drift. */
function formatTravelDate(date: string | null): string | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (date === iso) return "Today";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
