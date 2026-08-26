import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { BriefView } from "@/components/aircue/BriefView";
import { briefs } from "@/lib/aircue/data";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared Standby Brief — Aircue" },
      {
        name: "description",
        content:
          "A read-only standby brief shared by the traveler using airline benefits. No account required.",
      },
      { property: "og:title", content: "Shared Standby Brief — Aircue" },
      {
        property: "og:description",
        content: "Read-only view of departure, arrival, and flight-chain standby pressure.",
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

function SharedBriefPage() {
  const brief = Route.useLoaderData();

  return (
    <AppShell nav={false}>
      <div className="mb-4 rounded-xl border border-border bg-secondary p-4 text-sm">
        <p className="font-medium">Shared read-only brief</p>
        <p className="mt-1 text-muted-foreground">
          This link is read-only and expires after the trip. Watching and alerts stay with the
          person who shared it.
        </p>
      </div>
      <BriefView brief={brief} readOnly />
    </AppShell>
  );
}
