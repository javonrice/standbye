import { createFileRoute, Link } from "@tanstack/react-router";

import { LoadTask } from "@/components/aircue/LoadTask";

export const Route = createFileRoute("/_authenticated/plans/$planId/loads")({
  head: () => ({
    meta: [
      { title: "Add a load — Standbye" },
      {
        name: "description",
        content:
          "Upload a load board screenshot or enter open seats and listed standbys. Standbye re-scores your whole plan.",
      },
      { property: "og:title", content: "Add a load — Standbye" },
      {
        property: "og:description",
        content: "Screenshot or typed loads update your plan ranking.",
      },
    ],
  }),
  component: PlanAddLoads,
});

function PlanAddLoads() {
  const { planId } = Route.useParams();

  return (
    <LoadTask
      planId={planId}
      backTo={{
        label: "Back to plan",
        node: (
          <Link to="/plans/$planId" params={{ planId }}>
            Back to plan
          </Link>
        ),
      }}
    />
  );
}
