import { gatewayDot, type GatewayOption } from "@/lib/aircue/standby";

/** Compact gateway/connection option. */
export function RouteOptionRow({ gateway }: { gateway: GatewayOption }) {
  const place = gateway.city ?? gateway.hub;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="font-display text-[18px] font-semibold tracking-tight">
            Through {place} ({gateway.hub})
          </p>
          <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">
            {gateway.summary}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
          <span aria-hidden>{gatewayDot[gateway.state]}</span>
          {gateway.label}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-muted-foreground">
        Recovery onward: <span className="font-semibold text-foreground">{gateway.recoveryLabel}</span>
        {gateway.addedMinutes !== null && gateway.addedMinutes > 0
          ? ` · about ${gateway.addedMinutes} extra minutes in the air`
          : ""}
      </p>
    </div>
  );
}
