import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { gatewayDot, type GatewayOption } from "@/lib/aircue/standby";

/** A quiet alternate-route row. Everything detailed lives on the route screen. */
export function EscapeRouteRow({
  gateway,
  planId,
}: {
  gateway: GatewayOption;
  planId: string;
}) {
  const shots = gateway.inboundShots.length;

  return (
    <Link
      to="/escape/$planId/via/$hub"
      params={{ planId, hub: gateway.hub }}
      className="group flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-surface"
    >
      <span aria-hidden className="text-[13px] leading-none">
        {gatewayDot[gateway.state]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[17px] font-bold tracking-tight">
          Via {gateway.hub}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {shots} shot{shots === 1 ? "" : "s"} in · {gateway.onwardCount} onward
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}
