import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { pillarDot, type PillarState } from "@/lib/aircue/standby";

interface SignalRowProps {
  state: PillarState;
  title: string;
  detail: string;
  /** Optional destination. Without it the row is static. */
  to?: ReactNode;
}

/** One quiet line per signal: dot, plain label, plain explanation. */
export function SignalRow({ state, title, detail }: Omit<SignalRowProps, "to">) {
  return (
    <div className="flex items-start gap-3 py-3.5">
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${pillarDot[state]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">{title}</p>
        <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function SignalLinkRow({
  state,
  title,
  detail,
  to,
  params,
}: {
  state: PillarState;
  title: string;
  detail: string;
  to: string;
  params?: Record<string, string>;
}) {
  return (
    <Link
      to={to}
      params={params as never}
      className="flex items-start gap-3 py-3.5 transition-colors hover:bg-muted/40"
    >
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${pillarDot[state]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-tight">{title}</p>
        <p className="mt-1 text-[14px] leading-snug text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** A borderless group of signal rows separated by hairlines. */
export function SignalGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>;
}
