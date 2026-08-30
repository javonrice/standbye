import { pillarDisplayTitle, pillarDot, type Pillar } from "@/lib/aircue/standby";

export function PillarGrid({
  pillars,
  hasReportedLoad = false,
}: {
  pillars: Pillar[];
  /** When true, the availability pillar titles as Reported load. */
  hasReportedLoad?: boolean;
}) {
  const optionCtx = hasReportedLoad ? { load: true } : null;
  return (
    <dl className="grid grid-cols-2 gap-2">
      {pillars.map((p) => (
        <div key={p.key} className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${pillarDot[p.state]}`} aria-hidden />
            {pillarDisplayTitle(p.key, optionCtx)}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{p.label}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PillarList({
  pillars,
  hasReportedLoad = false,
}: {
  pillars: Pillar[];
  hasReportedLoad?: boolean;
}) {
  const optionCtx = hasReportedLoad ? { load: true } : null;
  return (
    <ul className="space-y-2">
      {pillars.map((p) => (
        <li key={p.key} className="flex gap-3 rounded-xl border border-border bg-card p-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${pillarDot[p.state]}`} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {pillarDisplayTitle(p.key, optionCtx)} · {p.label}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{p.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
