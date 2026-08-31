import { createFileRoute, Link } from "@tanstack/react-router";

import { LoadTask } from "@/components/aircue/LoadTask";
import { buildSegmentKey } from "@/lib/aircue/option-key";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/load")({
  head: () => ({
    meta: [
      { title: "Add a load — Standbye" },
      {
        name: "description",
        content:
          "Add open seats and listed standbys for this flight. Standbye re-scores the whole plan around the real numbers.",
      },
      { property: "og:title", content: "Add a load — Standbye" },
      { property: "og:description", content: "Real numbers re-rank your plan." },
    ],
  }),
  component: OptionAddLoad,
});

function OptionAddLoad() {
  const { optionId } = Route.useParams();
  const { data, isLoading } = useOption(optionId);

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading this flight…</p>;
  }

  if (!data?.planId || !data.option) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="font-display text-lg font-semibold">That option is gone</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Plans age out as the day moves. Build a fresh one to add loads.
        </p>
      </main>
    );
  }

  const firstSegment = data.option.segments[0];

  return (
    <LoadTask
      planId={data.planId}
      focusSegmentKey={firstSegment ? buildSegmentKey(firstSegment) : undefined}
      backTo={{
        label: data.option.flightLabel,
        node: (
          <Link to="/options/$optionId" params={{ optionId }}>
            {data.option.flightLabel}
          </Link>
        ),
      }}
    />
  );
}
