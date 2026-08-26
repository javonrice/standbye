import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/aircue/AppShell";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/aircue/StatusPill";
import { confidenceLabel } from "@/components/aircue/SignalRow";
import { getBrief, getSignal } from "@/lib/aircue/data";

export const Route = createFileRoute("/brief/$briefId/signal/$signalId")({
  head: () => ({
    meta: [
      { title: "Signal detail — Aircue" },
      {
        name: "description",
        content:
          "What this standby signal is, why it matters for a standby attempt, its timing, source, and how recently it was checked.",
      },
      { property: "og:title", content: "Signal detail — Aircue" },
      {
        property: "og:description",
        content: "One condition explained in plain language, with source and freshness.",
      },
    ],
  }),
  loader: ({ params }) => {
    const brief = getBrief(params.briefId);
    if (!brief) throw notFound();
    const signal = getSignal(brief, params.signalId);
    if (!signal) throw notFound();
    return { brief, signal };
  },
  component: SignalDetailPage,
});

function SignalDetailPage() {
  const { brief, signal } = Route.useLoaderData();

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/brief/$briefId"
          params={{ briefId: brief.id }}
          className="flex items-center gap-1 pb-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Brief
        </Link>

        <h1 className="font-display text-2xl font-bold tracking-tight">{signal.title}</h1>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill status={signal.level} size="sm" />
          <span className="text-xs text-muted-foreground">
            {confidenceLabel[signal.confidence]}
          </span>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-foreground/85">{signal.detail}</p>

        <h2 className="mt-6 font-display text-base font-bold tracking-tight">
          Why it matters for standby
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{signal.why}</p>

        <h2 className="mt-6 font-display text-base font-bold tracking-tight">Timing</h2>
        <p className="mt-1.5 text-sm text-foreground/85">
          {signal.location === "arrival"
            ? "Overlaps your arrival window"
            : signal.location === "departure"
              ? "Overlaps your departure window"
              : "Applies to this flight today"}
        </p>

        <h2 className="mt-6 font-display text-base font-bold tracking-tight">Source</h2>
        <p className="mt-1.5 text-sm text-foreground/85">{signal.source}</p>
        <p className="text-sm text-muted-foreground">Checked {signal.updated}</p>

        <Button asChild className="mt-7 h-12 w-full text-sm font-semibold">
          <Link to="/brief/$briefId" params={{ briefId: brief.id }}>
            Done
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
