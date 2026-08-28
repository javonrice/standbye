import { gatewayDot, type GatewayOption } from "@/lib/aircue/standby";

export function GatewayCard({ gateway, detailed }: { gateway: GatewayOption; detailed?: boolean }) {
  const place = gateway.city ?? gateway.hub;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold tracking-tight">
            Through {place} ({gateway.hub})
          </p>
          <p className="text-sm text-muted-foreground">{gateway.summary}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold">
          <span aria-hidden className="mr-1">
            {gatewayDot[gateway.state]}
          </span>
          {gateway.label}
        </span>
      </div>

      {detailed && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ways into {gateway.hub}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {gateway.inboundShots.map((shot) => (
              <li key={shot.flightLabel} className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {shot.flightLabel} · {shot.depLocal}
                </span>
                <span className="text-muted-foreground">
                  {shot.judgment === "favorable"
                    ? "Looks open"
                    : shot.judgment === "riskier"
                      ? "Tight"
                      : "Mixed"}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Onward departures
          </h3>
          <p className="mt-1.5 text-sm">
            {gateway.onwardDepartures.join(" · ")}
            {gateway.onwardCount > gateway.onwardDepartures.length && " …"}
          </p>
        </>
      )}

      <p className="mt-3 text-sm text-muted-foreground">
        Recovery room onward: <span className="font-semibold">{gateway.recoveryLabel}</span>
        {gateway.addedMinutes !== null && gateway.addedMinutes > 0
          ? ` · roughly ${gateway.addedMinutes} extra minutes of flying`
          : ""}
      </p>

      {gateway.caveat && (
        <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-muted-foreground">
          {gateway.caveat}
        </p>
      )}
    </div>
  );
}
