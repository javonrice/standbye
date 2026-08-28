import { pillarDot, pillarTitle, type Pillar } from "@/lib/aircue/standby";

export function PillarGrid({ pillars }: { pillars: Pillar[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      {pillars.map((p) => (
        <div key={p.key} className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${pillarDot[p.state]}`} aria-hidden />
            {pillarTitle[p.key]}
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-foreground">{p.label}</dd>
        </div>
      ))}
    </dl>
  );
}

export function PillarList({ pillars }: { pillars: Pillar[] }) {
  return (
    <ul className="space-y-2">
      {pillars.map((p) => (
        <li key={p.key} className="flex gap-3 rounded-xl border border-border bg-card p-3">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${pillarDot[p.state]}`} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {pillarTitle[p.key]} · {p.label}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{p.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
