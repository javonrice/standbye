import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/watching/")({
  beforeLoad: () => {
    throw redirect({ to: "/updates" });
  },
});
