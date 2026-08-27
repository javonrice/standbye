import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bell,
  ChevronLeft,
  Clock3,
  History,
  Info,
  Loader2,
  Share2,
} from "lucide-react";

import { SignalRow } from "@/components/aircue/SignalRow";
import { StatusPill, statusLabel } from "@/components/aircue/StatusPill";
import { cn } from "@/lib/utils";
import { startWatch } from "@/lib/aircue/brief.functions";
import { getDeviceId } from "@/lib/aircue/device";
import type { Brief, BriefStatus, Signal } from "@/lib/aircue/data";
import { disclaimer } from "@/lib/aircue/data";

function useWatchAction(tripId: string) {
  const [deviceId, setDeviceId] = useState("");
  const navigate = useNavigate();
  const watchFn = useServerFn(startWatch);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const mutation = useMutation({
    mutationFn: () => watchFn({ data: { tripId, deviceId } }),
    onSuccess: () => navigate({ to: "/watches" }),
  });

  return {
    start: () => {
      if (!deviceId || mutation.isPending) return;
      mutation.mutate();
    },
    pending: mutation.isPending,
  };
}


const orbGlow: Record<BriefStatus, string> = {
  clear: "radial-gradient(circle, var(--fine) 0%, transparent 70%)",
  watch: "radial-gradient(circle, var(--watch) 0%, transparent 70%)",
  elevated: "radial-gradient(circle, var(--rough) 0%, transparent 70%)",
  disruption: "radial-gradient(circle, var(--rough) 0%, transparent 70%)",
  incomplete: "radial-gradient(circle, var(--muted-foreground) 0%, transparent 70%)",
};

const orbGradient: Record<BriefStatus, string> = {
  clear:
    "conic-gradient(from 180deg, var(--fine) 0%, oklch(0.85 0.18 155) 25%, var(--fine-soft) 50%, oklch(0.7 0.16 165) 75%, var(--fine) 100%)",
  watch:
    "conic-gradient(from 180deg, var(--watch) 0%, oklch(0.88 0.16 70) 25%, var(--fine) 50%, oklch(0.78 0.14 85) 75%, var(--watch) 100%)",
  elevated:
    "conic-gradient(from 180deg, var(--rough) 0%, oklch(0.75 0.18 35) 25%, var(--watch) 50%, oklch(0.65 0.2 20) 75%, var(--rough) 100%)",
  disruption:
    "conic-gradient(from 180deg, oklch(0.55 0.22 20) 0%, var(--rough) 25%, oklch(0.45 0.18 25) 50%, oklch(0.65 0.2 20) 75%, oklch(0.55 0.22 20) 100%)",
  incomplete:
    "conic-gradient(from 180deg, var(--muted-foreground) 0%, oklch(0.7 0.02 250) 25%, var(--primary) 50%, oklch(0.55 0.02 260) 75%, var(--muted-foreground) 100%)",
};

const barColor: Record<BriefStatus, string> = {
  clear: "bg-fine",
  watch: "bg-primary",
  elevated: "bg-watch",
  disruption: "bg-rough",
  incomplete: "bg-muted-foreground",
};

function ChipRow({ brief }: { brief: Brief }) {
  const items: { key: string; label: string; status: BriefStatus }[] = [
    { key: "dep", label: brief.origin, status: brief.departure.status },
    { key: "arr", label: brief.destination, status: brief.arrival.status },
    { key: "chain", label: "Chain", status: brief.chain.status },
  ];

  return (
    <div className="flex items-center justify-center gap-3">
      {items.map((item) => (
        <div key={item.key} className="flex flex-col items-center gap-1.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border border-white/15",
              "glass-soft",
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", barColor[item.status])} />
          </span>
          <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  to,
  params,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to?: string;
  params?: Record<string, string>;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="glass glass-press glass-sheen flex h-14 w-14 items-center justify-center rounded-full">
        <Icon className="h-5 w-5 text-foreground" />
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-2">
        {inner}
      </button>
    );
  }

  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={to as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params={params as any}
      className="flex flex-1 flex-col items-center gap-2"
    >
      {inner}
    </Link>
  );
}


function Section({
  title,
  status,
  signals,
  briefId,
  unavailable,
}: {
  title: string;
  status: BriefStatus;
  signals: Signal[];
  briefId: string;
  unavailable?: string[] | undefined;
}) {
  return (
    <section className="glass glass-sheen mt-4 rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold tracking-tight">{title}</h2>
        <StatusPill status={status} size="sm" />
      </div>
      {signals.length > 0 && (
        <div className="mt-3 border-t border-white/10">
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} briefId={briefId} />
          ))}
        </div>
      )}

      {unavailable && unavailable.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          We could not check: {unavailable.join(", ")}.
        </p>
      )}
    </section>
  );
}

export function BriefView({ brief, readOnly = false }: { brief: Brief; readOnly?: boolean }) {
  const score = brief.pressure;

  return (
    <div className="aurora relative mx-auto w-full max-w-md px-1">
      {!readOnly && (
        <div className="flex items-center justify-between gap-3 pb-2 pt-1">
          <Link
            to="/"
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Flights
          </Link>
          <span className="text-xs text-muted-foreground">{brief.generatedAt}</span>
        </div>
      )}

      {/* Hero */}
      <div className="pt-2 text-center">
        <h1 className="font-display text-lg font-bold tracking-tight">
          {brief.tripName} · {brief.origin} → {brief.destination}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {brief.date} · {brief.departsLocal}
        </p>

        <div className="mt-5">
          <ChipRow brief={brief} />
        </div>

        <div className="relative mx-auto mt-7 h-44 w-44">
          <div
            className="absolute inset-[-18%] rounded-full blur-2xl animate-[orb-pulse_4s_ease-in-out_infinite]"
            style={{ background: orbGlow[brief.status], opacity: 0.7 }}
            aria-hidden
          />
          <div
            className="absolute inset-0 rounded-full animate-[orb-spin_12s_linear_infinite]"
            style={{ background: orbGradient[brief.status] }}
            aria-hidden
          />
          <div className="glass-soft absolute inset-0 rounded-full" aria-hidden />
        </div>

        <p className="mt-7 text-sm text-muted-foreground">Standby pressure looks</p>
        <p className="mt-1 font-display text-5xl font-bold tracking-tight">
          {statusLabel(brief.status)}
        </p>

        <div className="glass-soft mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          {brief.countdown}
        </div>
      </div>

      {/* Quick actions */}
      {!readOnly && (
        <div className="mt-7 flex items-start gap-2">
          <QuickAction
            icon={Bell}
            label="Watch"
            to="/brief/$briefId/watch"
            params={{ briefId: brief.id }}
          />
          {brief.shareToken && (
            <QuickAction
              icon={Share2}
              label="Share"
              to="/share/$token"
              params={{ token: brief.shareToken }}
            />
          )}
          <QuickAction icon={History} label="Changes" to="/watches" />
          <QuickAction icon={Info} label="More" to="/buddies" />
        </div>
      )}

      {/* Pressure bar */}
      <div className="glass mt-7 rounded-2xl px-4 py-3.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Standby pressure</span>
          <span className="text-muted-foreground">{score}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full transition-all", barColor[brief.status])}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Primary CTA */}
      {!readOnly && (
        <Link
          to="/brief/$briefId/watch"
          params={{ briefId: brief.id }}
          className="glass-press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-display text-base font-bold text-primary-foreground shadow-card"
        >
          <Bell className="h-5 w-5" /> Watch
        </Link>
      )}

      {/* Why */}
      <section className="glass glass-sheen mt-6 rounded-3xl p-5">
        <h2 className="font-display text-base font-bold tracking-tight">Why</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{brief.outlook}</p>
      </section>

      {(brief.changes ?? []).length > 0 && (
        <section className="glass glass-sheen mt-4 rounded-3xl p-5">
          <h2 className="font-display text-base font-bold tracking-tight">What changed</h2>
          <ul className="mt-2 border-t border-white/10">
            {(brief.changes ?? []).map((change) => (
              <li
                key={change.id}
                className="flex gap-3 border-b border-white/10 py-3 text-sm last:border-b-0"
              >
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{change.time}</span>
                <span className="text-foreground/85">{change.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Section
        title={`Departure · ${brief.departure.place}`}
        status={brief.departure.status}
        signals={brief.departure.signals ?? []}
        unavailable={brief.departure.unavailable}
        briefId={brief.id}
      />
      <Section
        title={`Arrival · ${brief.arrival.place}`}
        status={brief.arrival.status}
        signals={brief.arrival.signals ?? []}
        unavailable={brief.arrival.unavailable}
        briefId={brief.id}
      />
      <Section
        title="Flight chain"
        status={brief.chain.status}
        signals={brief.chain.signals ?? []}
        unavailable={brief.chain.unavailable}
        briefId={brief.id}
      />

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{disclaimer}</p>
    </div>
  );
}
