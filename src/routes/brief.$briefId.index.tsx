import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { BriefView } from "@/components/aircue/BriefView";
import { getBrief } from "@/lib/aircue/data";

export const Route = createFileRoute("/brief/$briefId/")({
  head: () => ({
    meta: [
      { title: "Standby brief — Aircue" },
      {
        name: "description",
        content:
          "Departure, arrival, and flight-chain conditions that could make this standby attempt harder, each with why it matters, confidence, and freshness.",
      },
      { property: "og:title", content: "Standby brief — Aircue" },
      {
        property: "og:description",
        content: "Status first, what it means, what changed, and the conditions behind it.",
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
