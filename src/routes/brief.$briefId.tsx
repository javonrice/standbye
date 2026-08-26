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
          "Route, reliability, backup, weather, and demand cues for a standby trip, in plain English.",
      },
      { property: "og:title", content: "Standby Brief — Aircue" },
      {
        property: "og:description",
        content: "Five plain-English cues that show whether standby looks harder than usual today.",
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
