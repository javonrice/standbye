import { createFileRoute, Link } from "@tanstack/react-router";

import { CueBadge } from "@/components/aircue/CueBadge";
import { DetailShell } from "@/components/aircue/DetailScreen";
import { useOption } from "@/lib/aircue/use-option";
import { gatewayDot } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/options/$optionId/recovery")({
  head: () => ({
    meta: [
      { title: "Backup runway — Standbye" },
      {
        name: "description",
        content:
          "What you would still have left if this standby attempt does not work: later nonstops and alternate routings.",
      },
      { property: "og:title", content: "Backup runway — Standbye" },
      { property: "og:description", content: "Your backup options if this attempt fails." },
    ],
  }),
  component: RecoveryRoom,
});

function RecoveryRoom() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const recovery = data?.option?.evidence.recovery;
  const ways = (recovery?.laterNonstops.length ?? 0) + (recovery?.alternates.length ?? 0);

  return (
    <DetailShell
      optionId={optionId}
      title="Backup runway"
      subtitle={
        data?.option
          ? `${data.option.flightLabel} · ${data.option.origin} → ${data.option.dest}`
          : "Loading…"
      }
    >
      {recovery && (
        <>
          <section className="mt-4 rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 font-display text-[19px] font-bold tracking-tight">

              <span aria-hidden className="text-[15px] leading-none">
                {gatewayDot[recovery.state]}
              </span>
              {recovery.label} recovery
            </p>
            <p className="mt-1.5 text-[15px] leading-snug text-foreground/90">
              {ways > 0
                ? `If this flight doesn't work, you still have ${ways} realistic way${
                    ways === 1 ? "" : "s"
                  } to keep moving today.`
                : "If this flight doesn't work, there is nothing realistic left today."}
            </p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {recovery.summary}
              {recovery.hoursRemaining !== null
                ? ` · about ${recovery.hoursRemaining} hour${
                    recovery.hoursRemaining === 1 ? "" : "s"
                  } of usable runway left today.`
                : ""}
            </p>
          </section>

          <section className="mt-6">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
              Later nonstops
            </h2>
            {recovery.laterNonstops.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing later today. If this one does not work, you are planning for tomorrow.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4">
                {recovery.laterNonstops.map((f) => (
                  <li key={f.flightLabel} className="flex items-center gap-3 py-3">
                    <span className="w-[4.5rem] shrink-0 font-display text-[16px] font-semibold tracking-tight">
                      {f.depLocal}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {f.flightLabel}
                    </span>
                    <CueBadge judgment={f.judgment} size="sm" short />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {recovery.alternates.length > 0 && (
            <section className="mt-6">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                Alternate routes
              </h2>
              <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4">
                {recovery.alternates.map((a) => (
                  <li key={a.routing} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[16px] font-bold tracking-tight">
                        {a.hub ?? a.routing}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {a.depLocal} · {a.note}
                      </span>
                    </span>
                    <CueBadge judgment={a.judgment} size="sm" short />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data?.planId && (
            <Link
              to="/plans/$planId/ways"
              params={{ planId: data.planId }}
              className="mt-5 inline-flex text-sm font-semibold text-primary"
            >
              See all ways there
            </Link>
          )}
        </>
      )}
    </main>
  );
}
