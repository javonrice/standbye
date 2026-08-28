import { gatewayDot, type GatewayOption } from "@/lib/aircue/standby";

/** Compact gateway/connection option, styled to scan alongside flight rows. */
export function RouteOptionRow({ gateway }: { gateway: GatewayOption }) {
  const place = gateway.city ?? gateway.hub;
  const waysIn = gateway.inboundShots.length;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-[14px] leading-none">
          {gatewayDot[gateway.state]}
        </span>
        <p className="font-display text-[17px] font-bold tracking-tight">Via {gateway.hub}</p>
        <span className="truncate text-[13px] text-muted-foreground">{place}</span>
      </div>

      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {waysIn} way{waysIn === 1 ? "" : "s"} in · {gateway.onwardCount} onward
        {gateway.addedMinutes !== null && gateway.addedMinutes > 0
          ? ` · about ${gateway.addedMinutes} extra min in the air`
          : ""}
      </p>

      <p className="mt-1 text-[13px]">
        <span className="font-medium text-foreground">{gateway.recoveryLabel}</span>
        <span className="text-muted-foreground"> recovery onward</span>
      </p>

      {gateway.caveat && (
        <p className="mt-1 text-[12px] text-muted-foreground">{gateway.caveat}</p>
      )}
    </div>
  );
}
