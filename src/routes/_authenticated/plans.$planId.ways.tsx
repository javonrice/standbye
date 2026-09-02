import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { LocalTime } from "@/components/aircue/LocalTime";
import { formatOptionArrival } from "@/lib/aircue/option-display";
import { getPlan } from "@/lib/aircue/plan.functions";
import type { GatewayOption, Judgment, OptionSegment, StandbyOption } from "@/lib/aircue/standby";
import { gatewayDot } from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/plans/$planId/ways")({
  head: () => ({
    meta: [
      { title: "Other ways — Standbye" },
      {
        name: "description",
        content:
          "Every realistic way to reach your destination today, including the connecting cities worth committing to.",
      },
      { property: "og:title", content: "Other ways — Standbye" },
      {
        property: "og:description",
        content: "The connecting cities that actually get you there today.",
      },
    ],
  }),
  component: AllWaysThere,
});

const judgmentPill: Record<Judgment, { label: string; classes: string; dot: string }> = {
  favorable: {
    label: "Looks good",
    dot: "bg-emerald-500",
    classes: "bg-emerald-100 text-emerald-700",
  },
  mixed: { label: "Mixed", dot: "bg-amber-500", classes: "bg-amber-100 text-amber-700" },
  riskier: { label: "Riskier", dot: "bg-rose-500", classes: "bg-rose-100 text-rose-700" },
  changed: {
    label: "Changed",
    dot: "bg-sky-500",
    classes: "bg-sky-100 text-sky-700",
  },
};

const cardTint: Record<Judgment, string> = {
  favorable: "border-l-emerald-500 bg-emerald-50/60",
  mixed: "border-l-amber-500 bg-amber-50/60",
  riskier: "border-l-rose-500 bg-rose-50/60",
  changed: "border-l-sky-500 bg-sky-50/60",
};

function AllWaysThere() {
  const { planId } = Route.useParams();
  const load = useServerFn(getPlan);
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => load({ data: { planId } }),
  });

  const options = useMemo(
    () => [...(plan?.options ?? [])].sort((a, b) => a.rank - b.rank),
    [plan?.options],
  );
  const gateways = plan?.gateways ?? [];

  const hubs = useMemo(() => {
    const set = new Set<string>();
    for (const o of options) {
      if (o.kind === "connection") {
        for (const s of o.segments.slice(0, -1)) {
          if (s.dest) set.add(s.dest);
        }
      }
    }
    return [...set];
  }, [options]);

  const [filter, setFilter] = useState<string>("all");

  const filtered = options.filter((o) => {
    if (filter === "all") return true;
    if (filter === "nonstop") return o.kind === "nonstop";
    return o.kind === "connection" && o.segments.slice(0, -1).some((s) => s.dest === filter);
  });

  const current = plan?.primaryOptionId
    ? filtered.filter((o) => o.id === plan.primaryOptionId)
    : [];
  const rest = filtered.filter((o) => o.id !== plan?.primaryOptionId);

  const dateLabel = plan?.travelDate ? formatDate(plan.travelDate) : null;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-6 md:max-w-2xl md:px-10">
      {/* Header */}
      <header className="relative flex items-center justify-center">
        <Link
          to="/plans/$planId"
          params={{ planId }}
          aria-label="Back to your plan"
          className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <p className="text-[15px] font-semibold">Other ways</p>
      </header>

      {plan && (
        <div className="mt-5">
          <h1 className="font-display text-[30px] font-bold tracking-tight">
            {plan.origin} → {plan.dest}
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            {dateLabel ? `${dateLabel} · ` : ""}
            {plan.travelers} traveler{plan.travelers === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Chip>
        <Chip active={filter === "nonstop"} onClick={() => setFilter("nonstop")}>
          Nonstop
        </Chip>
        {hubs.map((h) => (
          <Chip key={h} active={filter === h} onClick={() => setFilter(h)}>
            via {h}
          </Chip>
        ))}
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Looking at the network…</p>}

      {current.length > 0 && (
        <section className="mt-5">
          <SectionHeading>Current</SectionHeading>
          <div className="mt-2 space-y-3">
            {current.map((o) => (
              <WayCard key={o.id} option={o} />
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-5">
          {current.length > 0 ? <SectionHeading>Still open</SectionHeading> : null}
          <div className="mt-2 space-y-3">
            {rest.map((o) => (
              <WayCard key={o.id} option={o} />
            ))}
          </div>
        </section>
      )}

      {gateways.length > 0 && (
        <section className="mt-7">
          <SectionHeading>Backup runways</SectionHeading>
          <div className="mt-2 space-y-2">
            {gateways.map((g) => (
              <GatewayWayRow key={g.hub} gateway={g} />
            ))}
          </div>
        </section>
      )}

      {plan && !isLoading && filtered.length === 0 && gateways.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing useful is left on this route today. Either the nonstops are the whole story, or
          the onward flights out of every hub are already gone.
        </p>
      )}

      <p className="mt-7 text-xs text-muted-foreground">
        A connection means clearing standby twice. This is advanced exploration — Standbye only
        recommends one when the ways onward genuinely make up for it.
      </p>
    </main>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground/80 border border-border",
      )}
    >
      {children}
    </button>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </h2>
  );
}

function Pill({ judgment }: { judgment: Judgment }) {
  const p = judgmentPill[judgment];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
        p.classes,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", p.dot)} />
      {p.label}
    </span>
  );
}

function seatsLine(o: StandbyOption): string {
  const a = o.evidence.availability;
  if (!a.checked) return "Booking check not run yet";
  if (a.largestShowing) return `${a.largestShowing}+ seats publicly sellable`;
  return "No public seats showing";
}

function parseUtc(value?: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

function totalDuration(o: StandbyOption): string | null {
  const dep = parseUtc(o.segments[0]?.schedDepUtc ?? o.schedDepUtc);
  const arr = parseUtc(o.segments[o.segments.length - 1]?.schedArrUtc ?? o.schedArrUtc);
  if (dep === null || arr === null || arr <= dep) return null;
  return formatDuration(arr - dep);
}

function layoverAfter(segs: OptionSegment[], i: number): string | null {
  const arr = parseUtc(segs[i]?.schedArrUtc);
  const dep = parseUtc(segs[i + 1]?.schedDepUtc);
  if (arr === null || dep === null || dep <= arr) return null;
  return formatDuration(dep - arr);
}

function WayCard({ option }: { option: StandbyOption }) {
  const tint = cardTint[option.judgment];
  const isConnection = option.kind === "connection" && option.segments.length > 1;
  const duration = totalDuration(option);
  const stopCount = option.segments.length - 1;
  const onward = option.evidence.recovery.laterNonstops.length;

  if (!isConnection) {
    return (
      <Link
        to="/options/$optionId"
        params={{ optionId: option.id }}
        className={cn(
          "flex items-stretch gap-3 rounded-2xl border border-border border-l-4 px-4 py-3.5 transition-colors hover:border-primary/40",
          tint,
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="text-[15px] font-bold text-muted-foreground">#{option.rank}</span>
            <AirlineLogo code={carrierFromLabel(option.flightLabel)} size={22} />
            <p className="font-display text-[17px] font-bold tracking-tight">
              {option.flightLabel}
            </p>
          </div>
          <p className="mt-1.5 text-[14px] font-medium">
            {option.origin} → {option.dest}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{option.depLocal} · Nonstop</p>
          <SeatsText option={option} className="mt-1.5" />
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <Pill judgment={option.judgment} />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Link>
    );
  }

  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className={cn(
        "flex items-stretch gap-3 rounded-2xl border border-border border-l-4 px-4 py-3.5 transition-colors hover:border-primary/40",
        tint,
      )}
    >
      {/* Left column: rank, judgment, timing, stops, onward */}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-muted-foreground">#{option.rank}</p>
        <div className="mt-1.5">
          <Pill judgment={option.judgment} />
        </div>
        <p className="mt-2.5 font-display text-[15px] font-bold leading-tight tracking-tight">
          {option.depLocal}
          <span aria-hidden className="mx-1 text-muted-foreground">
            ——
          </span>
          <LocalTime value={formatOptionArrival(option)} />
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {duration ? `${duration} · ` : ""}
          {stopCount} stop{stopCount === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {onward} onward to {option.dest}
        </p>
      </div>

      {/* Right column: per-segment panel */}
      <div className="w-[52%] shrink-0 rounded-xl bg-card/90 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2.5">
            {option.segments.map((seg, i) => (
              <div key={`${seg.flightLabel}-${i}`}>
                {i > 0 ? (
                  <div className="my-2.5 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] text-muted-foreground">
                      {layoverAfter(option.segments, i - 1)
                        ? `${layoverAfter(option.segments, i - 1)} layover`
                        : "Layover"}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null}
                <div className="flex min-w-0 gap-2">
                  <AirlineLogo code={seg.carrier || carrierFromLabel(seg.flightLabel)} size={20} />
                  <div className="min-w-0">
                    <p className="text-[12px] text-muted-foreground">
                      {seg.origin} → {seg.dest}
                    </p>
                    <p className="font-display text-[15px] font-bold leading-tight tracking-tight">
                      {seg.flightLabel}
                    </p>
                    <SeatsText option={option} className="mt-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </div>
    </Link>
  );
}

function SeatsText({ option, className }: { option: StandbyOption; className?: string }) {
  const a = option.evidence.availability;
  if (!a.checked) {
    return (
      <p className={cn("text-[12px] text-muted-foreground", className)}>Booking check not run yet</p>
    );
  }
  if (!a.largestShowing) {
    return (
      <p className={cn("text-[12px] text-muted-foreground", className)}>No public seats showing</p>
    );
  }
  return (
    <p className={cn("text-[13px] font-bold leading-tight", className)}>
      {a.largestShowing}+ seats
      <span className="block text-[12px] font-normal text-muted-foreground">publicly sellable</span>
    </p>
  );
}

function GatewayWayRow({ gateway }: { gateway: GatewayOption }) {
  const waysIn = gateway.inboundShots.length;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-[13px] leading-none">
            {gatewayDot[gateway.state]}
          </span>
          <p className="truncate font-display text-[16px] font-bold tracking-tight">
            Via {gateway.hub}
          </p>
          <span className="truncate text-[13px] text-muted-foreground">
            {gateway.city ?? gateway.hub}
          </span>
        </div>
        <p className="mt-1.5 text-[14px] font-medium">
          {waysIn} way{waysIn === 1 ? "" : "s"} in · {gateway.onwardCount} onward option
          {gateway.onwardCount === 1 ? "" : "s"}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {gateway.recoveryLabel} backup runway
          {gateway.addedMinutes !== null && gateway.addedMinutes > 0
            ? ` · about ${gateway.addedMinutes} extra min in the air`
            : ""}
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (isToday) return "Today";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
