import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { RoutePath } from "@/components/aircue/RoutePath";
import { Button } from "@/components/ui/button";
import { gatewayDot, type GatewayOption } from "@/lib/aircue/standby";

/** The one thing Standbye would actually try next. Everything else is quieter. */
export function EscapeBestCard({
  gateway,
  planId,
  origin,
  dest,
  optionId,
}: {
  gateway: GatewayOption;
  planId: string;
  origin: string;
  dest: string;
  optionId: string | null;
}) {
  const shots = gateway.inboundShots.length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        <span aria-hidden>{gatewayDot[gateway.state]}</span> Best escape
      </p>

      <div className="mt-3">
        <RoutePath origin={origin} hub={gateway.hub} dest={dest} size="lg" />
      </div>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Via {gateway.city ?? gateway.hub}
      </p>

      <div className="mt-4 space-y-3 text-[14px]">
        <TimeBlock
          term={`Out of ${origin}`}
          items={gateway.inboundShots.map((shot) => `${shot.depLocal} · ${shot.flightLabel}`)}
          empty="No named departures came back for this leg."
        />
        <TimeBlock
          term={`${gateway.hub} → ${dest}`}
          items={gateway.onwardDepartures}
          empty="Nothing useful onward right now."
        />
      </div>

      <dl className="mt-4 space-y-2 border-t border-border pt-3 text-[14px]">
        <Line term="Recovery Room" value={gateway.recoveryLabel} />
        {gateway.addedMinutes !== null && gateway.addedMinutes > 0 && (
          <Line term="Extra travel" value={`about ${gateway.addedMinutes} min`} />
        )}
        <Line term="Ways out" value={`${shots} shot${shots === 1 ? "" : "s"}`} />
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed text-foreground">{gateway.summary}</p>
      {gateway.caveat && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {gateway.caveat}
        </p>
      )}

      <div className="mt-5 space-y-2">
        {optionId && (
          <Button asChild className="h-12 w-full rounded-xl text-[15px] font-semibold">
            <Link to="/options/$optionId" params={{ optionId }}>
              Use this escape
            </Link>
          </Button>
        )}
        <Link
          to="/escape/$planId/via/$hub"
          params={{ planId, hub: gateway.hub }}
          className="flex items-center justify-center gap-1 py-1 text-[14px] font-semibold text-primary"
        >
          See the full routing <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function Line({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
