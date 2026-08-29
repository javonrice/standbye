import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/watching/$watchId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/updates/$watchId", params: { watchId: params.watchId } });
  },
});
