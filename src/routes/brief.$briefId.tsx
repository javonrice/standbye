import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { BriefView } from "@/components/aircue/BriefView";
import { getBrief } from "@/lib/aircue/data";

export const Route = createFileRoute("/brief/$briefId")({
  head: () => ({
    meta: [
      { title: "Standby Brief — Aircue" },
      {
        name: "description",
        content:
          "A standby brief covering departure, arrival, and flight-chain pressure with confidence and source freshness.",
      },
      { property: "og:title", content: "Standby Brief — Aircue" },
      {
        property: "og:description",
        content: "Departure, arrival, and flight-chain pressure for a standby attempt.",
      },
    ],
  }),
  loader: ({ params }) => {
    const brief = getBrief(params.briefId);
    if (!brief) throw notFound();
    return brief;
  },
  component: BriefPage,
});

function BriefPage() {
  const brief = Route.useLoaderData();

  return (
    <AppShell>
      <BriefView brief={brief} />
    </AppShell>
  );
}
