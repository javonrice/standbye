import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { StatusPill } from "@/components/aircue/StatusPill";
import { allSignals, briefs } from "@/lib/aircue/data";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared standby brief — Aircue" },
      {
        name: "description",
        content:
          "A read-only standby brief: current status, the strongest conditions, and what Aircue does not know. No account required.",
      },
      { property: "og:title", content: "Shared standby brief — Aircue" },
      {
        property: "og:description",
        content: "Read-only status and the strongest conditions affecting this standby attempt.",
      },
    ],
  }),
  loader: ({ params }) => {
    const brief = briefs.find((b) => b.shareToken === params.token);
    if (!brief) throw notFound();
    return brief;
  },
  component: SharedBriefPage,
});

const rank = { disruption: 4, elevated: 3, watch: 2, incomplete: 1, clear: 0 } as const;

function SharedBriefPage() {
  const brief = Route.useLoaderData();
  const strongest = allSignals(brief)
    .slice()
    .sort((a, b) => rank[b.level] - rank[a.level])
    .slice(0, 3);

  return (
    <AppShell nav={false}>
      <div className="mx-auto w-full max-w-md">
        <p className="font-display text-lg font-bold tracking-tight">Shared standby brief</p>
        <p className="text-xs text-muted-foreground">Read-only</p>

        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
          {brief.flightNumber} · {brief.origin} → {brief.destination}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{brief.date}</p>

        <section className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-card">
          <StatusPill status={brief.status} />
          <p className="mt-3 font-display text-lg font-bold leading-snug tracking-tight">
            {brief.outlook}
          </p>
        </section>

        <h2 className="mt-6 font-display text-base font-bold tracking-tight">Strongest issues</h2>
        <ol className="mt-1.5 list-decimal pl-5 text-sm text-foreground/85">
          {strongest.map((s) => (
            <li key={s.id} className="mt-1">
              {s.detail}
            </li>
          ))}
        </ol>

        <h2 className="mt-6 font-display text-base font-bold tracking-tight">
          What Aircue does not know
        </h2>
        <ul className="mt-1.5 list-disc pl-5 text-sm text-muted-foreground">
          <li>Open seats</li>
          <li>Standby list place</li>
          <li>Whether you will board</li>
        </ul>

        <p className="mt-6 text-xs text-muted-foreground">{brief.generatedAt}</p>
      </div>
    </AppShell>
  );
}
