import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { AirlineLogo, carrierFromLabel } from "@/components/aircue/AirlineLogo";
import { CueBadge } from "@/components/aircue/CueBadge";
import {
  formatOptionTimingRange,
  optionDisambiguationNote,
} from "@/lib/aircue/option-display";
import {
  pillarDot,
  pillarTitle,
  type Pillar,
  type PillarKey,
  type StandbyOption,
} from "@/lib/aircue/standby";
import { cn } from "@/lib/utils";

/** Signals worth scanning in a collapsed row. History stays on the detail screen. */
const SCAN_ORDER: PillarKey[] = ["availability", "operations", "recovery"];

function scanSignals(pillars: Pillar[]): Pillar[] {
  const picked = SCAN_ORDER.map((key) => pillars.find((p) => p.key === key)).filter(
    (p): p is Pillar => Boolean(p),
  );
  if (picked.length >= 3) return picked.slice(0, 3);
  const rest = pillars.filter((p) => !picked.includes(p));
  return [...picked, ...rest].slice(0, 3);
}

type Emphasis = "primary" | "default" | "secondary";

/**
 * One ranked standby setup, built to be scanned like a flight result rather than
 * read like a dashboard. `emphasis` controls how loudly it competes with the
 * traveler's chosen primary option.
 */
export function StandbyOptionRow({
  option,
  rank,
  emphasis = "default",
  peers = [],
}: {
  option: StandbyOption;
  rank: number;
  emphasis?: Emphasis;
  /** Other options on the same plan — used only to disambiguate identical labels. */
  peers?: StandbyOption[];
}) {
  const signals = scanSignals(option.pillars);
  const laterShots = option.evidence.recovery.laterNonstops.length;
  const isTop = rank === 1;
  const strong = emphasis === "primary" || (emphasis === "default" && isTop);
  const arrival = formatOptionArrival(option);
  const disambiguation = optionDisambiguationNote(option, peers);


  return (
    <Link
      to="/options/$optionId"
      params={{ optionId: option.id }}
      className={cn(
        "group block rounded-2xl border px-4 transition-colors hover:border-primary/40",
        emphasis === "secondary" ? "py-3 bg-card/60" : "py-4 bg-card",
        emphasis === "primary"
          ? "border-primary/50 shadow-card"
          : strong
            ? "border-primary/30 shadow-card"
            : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {emphasis !== "primary" && (
          <span
            className={cn(
              "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold",
              strong ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {rank}
          </span>
        )}
        <CueBadge judgment={option.judgment} size="sm" short />
        {option.kind === "connection" && (
          <span className="text-[12px] font-medium text-muted-foreground">One stop</span>
        )}
        {option.access === "home" && (
          <span className="text-[12px] font-medium text-muted-foreground">Home</span>
        )}
        {option.access === "zed" && (
          <span className="text-[12px] font-medium text-muted-foreground">ZED</span>
        )}
        {option.access === "other" && (
          <span className="text-[12px] font-medium text-muted-foreground">Other access</span>
        )}
        {option.staffEligibility === "uncertain" &&
          option.operatorVerification?.status === "unverified" && (
            <span className="text-[12px] font-medium text-muted-foreground">Access unchecked</span>
          )}
        {option.staffEligibility === "eligible" && (
          <span className="text-[12px] font-medium text-muted-foreground">Staff access OK</span>
        )}
        {option.staffEligibility === "ineligible" && (
          <span className="text-[12px] font-semibold text-rough-foreground">Not staff-eligible</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <AirlineLogo
          code={carrierFromLabel(option.flightLabel)}
          size={emphasis === "primary" ? 40 : 34}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "break-words font-display font-bold leading-snug tracking-tight",
              emphasis === "primary" ? "text-[19px]" : "text-[17px]",
            )}
          >
            {option.flightLabel}
          </p>
          <p
            className={cn(
              "mt-1 break-words font-display font-semibold tracking-tight",
              emphasis === "primary" ? "text-[23px]" : "text-[19px]",
            )}
          >
            {option.depLocal ? <>{option.depLocal} → </> : null}
            <LocalTime value={arrival} />
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {option.origin} &nbsp;·&nbsp; {option.dest}
            {laterShots > 0 ? ` · ${laterShots} later shot${laterShots === 1 ? "" : "s"}` : ""}
          </p>
          {disambiguation && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">{disambiguation}</p>
          )}

        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>

      {emphasis !== "secondary" && (
        <dl className="mt-3 space-y-1 border-t border-border/70 pt-2.5">
          {signals.map((p) => (
            <div key={p.key} className="flex items-center gap-2 text-[13px]">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pillarDot[p.state])} aria-hidden />
              <dt className="w-24 shrink-0 text-muted-foreground">{pillarTitle[p.key]}</dt>
              <dd className="min-w-0 truncate font-medium text-foreground">{p.label}</dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}
