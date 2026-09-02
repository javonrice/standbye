import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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
import { formatOptionArrival } from "@/lib/aircue/option-display";
import {
  agoLabel,
  loadSourceLabel,
  type PillarState,
  type StandbyOption,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

const pillarStateText: Record<PillarState, string> = {
  good: "text-emerald-600",
  fair: "text-amber-600",
  poor: "text-rose-600",
  unknown: "text-muted-foreground",
};

const pillarTitleV2: Record<string, string> = {
  availability: "Booking check",
  operations: "Operations",
  recovery: "Backup runway",
  history: "History",
};

/**
 * The single flight briefing layout: hero flight, seats, why it ranks here,
 * more context. Plan detail and option detail render the identical structure
 * so the two never feel like different products.
 */
export function OptionBrief({
  option,
  travelDate,
  children,
}: {
  option: StandbyOption;
  travelDate: string | null;
  /** Screen-specific actions rendered under "More context". */
  children?: ReactNode;
}) {
  const dateLabel = formatTravelDate(travelDate);
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
    <div className="mx-auto max-w-md px-5">
      {/* Hero */}
      <section className="pt-5">
        <div className="flex items-center gap-3">
          <AirlineLogo code={carrierFromLabel(option.flightLabel)} size={40} />
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight">
            {option.flightLabel}
          </h1>
        </div>

        {dateLabel ? <p className="mt-3 text-[14px] text-muted-foreground">{dateLabel}</p> : null}
        <p className="mt-1 font-display text-[20px] font-semibold tracking-tight">
          {option.origin} → {option.dest}
        </p>

        <div className="mt-5 space-y-4">
          <TimeRow code={option.origin} time={option.depLocal} label="Departs" />
          <TimeRow code={option.dest} time={formatOptionArrival(option)} label="Arrives" />
        </div>

        <p className="mt-4 text-[13px] text-muted-foreground">{stops} · all times local</p>
        <p className="text-[13px] text-muted-foreground">
          {availability.checkedAt ? `Checked ${agoLabel(availability.checkedAt)}` : "Not checked yet"}
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
              {loadSourceLabel[option.load.source] ?? "Reported"} · {agoLabel(option.load.checkedAt)}
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
          <Link to="/options/$optionId/load" params={{ optionId: option.id }}>
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
                {pillarTitleV2[p.key] ?? p.key}
              </p>
              <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{p.detail}</p>
            </div>
            <p className={cn("text-[14px] font-semibold", pillarStateText[p.state])}>{p.label}</p>
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
                <p className="text-[15px] font-semibold leading-tight">Operations &amp; weather</p>
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
                <p className="mt-1 text-[13px] font-normal text-muted-foreground">{holiday.name}</p>
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

      {children}

      <p className="mt-6 text-xs text-muted-foreground">
        Standbye reads public booking signals and operating conditions. It is not airline load data
        and never predicts whether you will clear.
      </p>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
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

/** "Today" / "Sat, Sep 5" from a plain yyyy-mm-dd date, without timezone drift. */
export function formatTravelDate(date: string | null): string | null {
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
