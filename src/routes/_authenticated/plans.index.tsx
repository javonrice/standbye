import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/plans/")({
  beforeLoad: () => {
    throw redirect({ to: "/plan" });
  },
});
