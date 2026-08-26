import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { BottomNav } from "@/components/aircue/BottomNav";

export const Route = createFileRoute("/buddies")({
  head: () => ({
    meta: [
      { title: "Buddies — Aircue" },
      {
        name: "description",
        content: "See flights your buddies are watching and share standby briefs.",
      },
      { property: "og:title", content: "Buddies — Aircue" },
      {
        property: "og:description",
        content: "See flights your buddies are watching and share standby briefs.",
      },
    ],
  }),
  component: BuddiesPage,
});

function BuddiesPage() {
  return (
    <>
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">Buddies</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Share standby briefs with family or crew and see who else is watching the same flights.
        </p>
        <p className="mt-6 text-xs text-muted-foreground">Coming soon.</p>
      </div>
      <BottomNav />
    </>
  );
}
