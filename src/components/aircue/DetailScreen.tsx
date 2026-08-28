import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { pillarDot, type PillarState } from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/**
 * Shared language for the secondary intelligence screens. These are drill-downs
 * from the option detail, so they all share the same back link, lead line,
 * module and bar treatments.
 */

export function DetailShell({
  optionId,
  title,
  subtitle,
  children,
}: {
  optionId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}

      {children}
    </main>
  );
}

/** The interpretation, stated before any data. */
export function DetailLead({ state, label }: { state: PillarState; label: string }) {
  return (
    <p className="mt-5 flex items-center gap-2 font-display text-lg font-semibold">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", pillarDot[state])} aria-hidden />
      {label}
    </p>
  );
}

/** A small section heading in the detail language. */
export function DetailHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-7 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

/** One quiet information module: short title, plain body. */
export function DetailModule({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className={cn("text-sm leading-snug text-muted-foreground", title && "mt-1.5")}>
        {children}
      </div>
    </div>
  );
}

/** A compact good-to-know row: label above, plain value below. */
export function FactRow({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state?: PillarState;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      {state ? (
        <span
          className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", pillarDot[state])}
          aria-hidden
        />
      ) : (
        <span className="mt-2 h-2 w-2 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-[15px] font-medium leading-snug">{value}</p>
      </div>
    </div>
  );
}

export function FactGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border/70">{children}</div>;
}

/** A labelled bar. `value` is the descriptive right-hand label, never invented. */
export function DataBar({
  label,
  fill,
  value,
  tone = "primary",
}: {
  label: string;
  /** 0–100 fill of the track. */
  fill: number;
  value: string;
  tone?: "primary" | "muted";
}) {
  const clamped = Math.min(100, Math.max(0, fill));
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="text-[13px] font-medium">{value}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", tone === "primary" ? "bg-primary" : "bg-foreground/30")}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** The party-size probe visual: dots that fade out where selling stops. */
export function PartyScale({
  tested,
}: {
  tested: Array<{ adults: number; showing: boolean }>;
}) {
  return (
    <div className="mt-4 flex items-end gap-5">
      {tested.map((t) => (
        <div key={t.adults} className="flex flex-col items-center gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">{t.adults}</span>
          <span
            className={cn(
              "h-3.5 w-3.5 rounded-full",
              t.showing ? "bg-primary" : "border border-border bg-transparent",
            )}
            aria-label={t.showing ? "still selling" : "not selling"}
          />
        </div>
      ))}
    </div>
  );
}
