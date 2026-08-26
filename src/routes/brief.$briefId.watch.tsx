import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronLeft, MailCheck } from "lucide-react";

import { AppShell } from "@/components/aircue/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrief } from "@/lib/aircue/data";

export const Route = createFileRoute("/brief/$briefId/watch")({
  head: () => ({
    meta: [
      { title: "Watch this flight — Aircue" },
      {
        name: "description",
        content:
          "Get an email only when something meaningful changes for your standby flight: status worsens, a ground stop starts, or weather enters your window.",
      },
      { property: "og:title", content: "Watch this flight — Aircue" },
      {
        property: "og:description",
        content: "Email alerts for meaningful changes only. Watching stops after the trip.",
      },
    ],
  }),
  loader: ({ params }) => {
    const brief = getBrief(params.briefId);
    if (!brief) throw notFound();
    return brief;
  },
  component: WatchPage,
});

function WatchPage() {
  const brief = Route.useLoaderData();
  const [email, setEmail] = useState(brief.watch?.email ?? "");
  const [sent, setSent] = useState(false);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/brief/$briefId"
          params={{ briefId: brief.id }}
          className="flex items-center gap-1 pb-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Brief
        </Link>

        <h1 className="font-display text-2xl font-bold tracking-tight">
          Watch {brief.flightNumber}
        </h1>

        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <Label htmlFor="email" className="text-xs text-muted-foreground">
            Email for alerts
          </Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="mt-1.5 h-12 bg-card text-base"
          />

          <p className="mt-3 text-sm text-muted-foreground">
            We’ll email you only when something meaningful changes.
          </p>

          <h2 className="mt-6 font-display text-base font-bold tracking-tight">Examples</h2>
          <ul className="mt-1.5 list-disc pl-5 text-sm text-muted-foreground">
            <li>Status gets worse</li>
            <li>FAA ground stop starts</li>
            <li>Weather enters your window</li>
            <li>Your flight is delayed or cancelled</li>
          </ul>

          <p className="mt-3 text-sm text-muted-foreground">We won’t spam minor updates.</p>

          <Button type="submit" className="mt-6 h-12 w-full text-sm font-semibold">
            Send verification email
          </Button>
        </form>

        {sent && (
          <p className="mt-3 flex items-center gap-2 text-sm text-fine-foreground">
            <MailCheck className="h-4 w-4 shrink-0" />
            Verification sent to {email}. Confirm it to start watching.
          </p>
        )}

        <p className="mt-6 text-xs text-muted-foreground">Watching stops after the trip.</p>
      </div>
    </AppShell>
  );
}
