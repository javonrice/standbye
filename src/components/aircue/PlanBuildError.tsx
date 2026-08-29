import { isUnresolvedAirportMessage, planBuildErrorMessage } from "@/lib/aircue/plan-build-errors";

/**
 * Inline plan-builder failure. Invalid airport codes read as a correctable
 * input problem; provider/data failures stay visibly distinct and calmer.
 */
export function PlanBuildError({ error }: { error: unknown }) {
  const message = planBuildErrorMessage(error);
  const badAirport = isUnresolvedAirportMessage(message);

  if (badAirport) {
    return (
      <div
        role="alert"
        className="mt-3 rounded-2xl border border-rough/40 bg-rough-soft px-4 py-3"
      >
        <p className="text-[14px] font-semibold text-rough-foreground">{message}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Airport codes are three letters, like ORD or FRA.
        </p>
      </div>
    );
  }

  return (
    <div role="alert" className="mt-3 rounded-2xl border border-border bg-muted/50 px-4 py-3">
      <p className="text-[14px] font-semibold text-foreground">{message}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        Your search is fine — this one is on the data side.
      </p>
    </div>
  );
}
