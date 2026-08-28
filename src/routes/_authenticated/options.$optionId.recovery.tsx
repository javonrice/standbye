import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/recovery")({
  head: () => ({
    meta: [
      { title: "Recovery room — AirCue" },
      {
        name: "description",
        content:
          "What you would still have left if this standby attempt does not work: later nonstops and alternate routings.",
      },
      { property: "og:title", content: "Recovery room — AirCue" },
      { property: "og:description", content: "Your backup options if this attempt fails." },
    ],
  }),
  component: RecoveryRoom,
});

function RecoveryRoom() {
  const { optionId } = Route.useParams();
  const { data } = useOption(optionId);
  const recovery = data?.option?.evidence.recovery;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Recovery room</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The honest question is not just whether this works. It is what you do if it does not.
      </p>

      {recovery && (
        <>
          <div className="mt-5 rounded-2xl border border-border bg-card p-4">
            <p className="font-display text-lg font-semibold">{recovery.label} recovery room</p>
            <p className="mt-1 text-sm text-muted-foreground">{recovery.summary}</p>
            {recovery.hoursRemaining !== null && (
              <p className="mt-2 text-sm text-muted-foreground">
                About {recovery.hoursRemaining} hour{recovery.hoursRemaining === 1 ? "" : "s"} of
                usable runway left on this route today.
              </p>
            )}
          </div>

          <h2 className="mt-6 font-display text-base font-bold tracking-tight">
            Later on this route
          </h2>
          {recovery.laterNonstops.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing later today. If this one does not work, you are planning for tomorrow.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recovery.laterNonstops.map((f) => (
                <li
                  key={f.flightLabel}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
                >
                  <span>
                    <span className="block text-sm font-semibold">{f.flightLabel}</span>
                    <span className="block text-xs text-muted-foreground">{f.depLocal} local</span>
                  </span>
                  <JudgmentPill judgment={f.judgment} size="sm" />
                </li>
              ))}
            </ul>
          )}

          {recovery.alternates.length > 0 && (
            <>
              <h2 className="mt-6 font-display text-base font-bold tracking-tight">
                Alternate routings
              </h2>
              <ul className="mt-2 space-y-2">
                {recovery.alternates.map((a) => (
                  <li key={a.routing} className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{a.routing}</span>
                      <JudgmentPill judgment={a.judgment} size="sm" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.depLocal} local · {a.note}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}
