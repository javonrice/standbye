import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Clock } from "lucide-react";

import { AppShell } from "@/components/aircue/AppShell";
import { StatusPill } from "@/components/aircue/StatusPill";
import { Button } from "@/components/ui/button";
import { briefs } from "@/lib/aircue/data";

export const Route = createFileRoute("/watches")({
  head: () => ({
    meta: [
      { title: "My watches — Aircue standby monitoring" },
      {
        name: "description",
        content:
          "Flights Aircue is monitoring for material changes in weather, airport operations, FAA programs, and destination demand.",
      },
      { property: "og:title", content: "My watches — Aircue standby monitoring" },
      {
        property: "og:description",
        content: "Flights Aircue is monitoring for material standby pressure changes.",
      },
    ],
  }),
  component: WatchesPage,
});

function WatchesPage() {
  const watched = briefs.filter((b) => b.watch?.active);

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold tracking-tight">My watches</h1>
      <p className="mt-1 text-muted-foreground">
        Aircue emails you once per material change and stops monitoring automatically after the
        trip.
      </p>

      <div className="mt-6 space-y-4">
        {watched.map((brief) => (
          <article
            key={brief.id}
            className="rounded-xl border border-border bg-card p-5 shadow-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-xl font-bold">{brief.flightNumber}</p>
                <p className="text-sm font-medium">
                  {brief.origin} → {brief.destination} · {brief.date}
                </p>
                <p className="text-sm text-muted-foreground">
                  {brief.departsLocal} – {brief.arrivesLocal}
                </p>
              </div>
              <StatusPill status={brief.status} size="sm" />
            </div>

            <p className="mt-3 text-sm text-foreground/80">{brief.verdict}</p>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Next check {brief.watch?.nextCheck}
              </span>
              <span className="flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                Alerts to {brief.watch?.email}
              </span>
              <span>{brief.watch?.expires}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" className="h-10">
                <Link to="/brief/$briefId" params={{ briefId: brief.id }}>
                  Open brief
                </Link>
              </Button>
              <Button variant="ghost" className="h-10 text-muted-foreground">
                Stop watching
              </Button>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
