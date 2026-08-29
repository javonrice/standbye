import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One page wrapper for every authenticated screen: mobile-first padding, a
 * comfortable reading width, and bottom padding that clears the fixed nav
 * plus the iOS safe area.
 */
export function Screen({
  children,
  className,
  width = "md",
}: {
  children: ReactNode;
  className?: string;
  width?: "md" | "lg";
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-md px-5 pt-7 md:px-10 md:pt-12",
        width === "lg" ? "md:max-w-3xl" : "md:max-w-2xl",
        "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-16",
        className,
      )}
    >
      {children}
    </main>
  );
}

/** Section title, optionally with a quiet eyebrow and a trailing action. */
export function SectionHeading({
  eyebrow,
  title,
  hint,
  action,
  tone = "default",
  className,
}: {
  eyebrow?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
  tone?: "default" | "quiet" | "attention";
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.14em]",
              tone === "attention" ? "text-rough-foreground" : "text-muted-foreground",
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={cn(
            "font-display font-semibold tracking-tight",
            tone === "quiet"
              ? "text-[15px] text-muted-foreground"
              : "text-[19px] text-foreground",
            eyebrow ? "mt-0.5" : "",
          )}
        >
          {title}
        </h2>
        {hint ? <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Copy-led empty state — no icon, no decoration, one action at most. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-10 text-center", className)}>
      <p className="font-display text-[22px] font-semibold tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

type StatusTone = "quiet" | "active" | "attention";

const dotTone: Record<StatusTone, string> = {
  quiet: "bg-muted-foreground/50",
  active: "bg-primary",
  attention: "bg-rough",
};

const textTone: Record<StatusTone, string> = {
  quiet: "text-muted-foreground",
  active: "text-primary",
  attention: "text-rough-foreground",
};

/** A status expressed as words plus one small dot — never as a pill. */
export function StatusLine({
  tone = "quiet",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 text-[13px] font-medium", textTone[tone], className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone[tone])} aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
