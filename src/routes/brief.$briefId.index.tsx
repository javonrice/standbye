import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { BriefView } from "@/components/aircue/BriefView";
import { getBrief } from "@/lib/aircue/brief.functions";

export const Route = createFileRoute("/brief/$briefId/")({
  head: () => ({
    meta: [
      { title: "Standby brief — Aircue" },
      {
        name: "description",
        content:
          "Live departure, arrival, and flight-chain conditions that could make this standby attempt harder, with a 0-100 standby pressure index.",
      },
      { property: "og:title", content: "Standby brief — Aircue" },
      {
        property: "og:description",
        content: "Status first, what changed, and the live conditions behind it.",
      },
    ],
  }),
  loader: async ({ params }) => {
    const brief = await getBrief({ data: { tripId: params.briefId } });
    if (!brief) throw notFound();
    const history = await getTripHistory({ data: { tripId: params.briefId } }).catch(() => null);
    return { brief, history };
  },
  errorComponent: () => (
    <AppShell>
      <div className="mx-auto w-full max-w-md py-10 text-center">
        <h1 className="font-display text-xl font-bold">We could not build this brief</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          One of the live sources did not respond. Try again in a moment.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
          Check another flight
        </Link>
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="mx-auto w-full max-w-md py-10 text-center">
        <h1 className="font-display text-xl font-bold">Brief not found</h1>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
          Check a flight
        </Link>
      </div>
    </AppShell>
  ),
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
