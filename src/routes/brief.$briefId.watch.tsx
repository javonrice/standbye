import { useEffect, useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, ChevronLeft, Loader2 } from "lucide-react";

import { AppShell } from "@/components/aircue/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrief, startWatch } from "@/lib/aircue/brief.functions";
import { getDeviceId, getSavedEmail, saveEmail } from "@/lib/aircue/device";

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
  loader: async ({ params }) => {
    const brief = await getBrief({ data: { tripId: params.briefId } });
    if (!brief) throw notFound();
    return brief;
  },
  component: WatchPage,
});

function WatchPage() {
  const brief = Route.useLoaderData();
  const [email, setEmail] = useState(brief.watch?.email ?? "");
  const [deviceId, setDeviceId] = useState("");
  const watchFn = useServerFn(startWatch);

  useEffect(() => {
    setDeviceId(getDeviceId());
    setEmail((current) => current || getSavedEmail());
  }, []);

  const mutation = useMutation({
    mutationFn: () => watchFn({ data: { tripId: brief.id, email, deviceId } }),
    onSuccess: () => saveEmail(email),
  });

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
            mutation.mutate();
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
            We’ll flag it under Watching when something meaningful changes. Email alerts arrive
            with accounts.
          </p>

          <h2 className="mt-6 font-display text-base font-bold tracking-tight">Examples</h2>
          <ul className="mt-1.5 list-disc pl-5 text-sm text-muted-foreground">
            <li>Status gets worse</li>
            <li>FAA ground stop starts</li>
            <li>Weather enters your window</li>
            <li>Your flight is delayed or cancelled</li>
          </ul>

          <p className="mt-3 text-sm text-muted-foreground">We won’t spam minor updates.</p>

          <Button
            type="submit"
            disabled={mutation.isPending}
            className="mt-6 h-12 w-full text-sm font-semibold"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting watch
              </>
            ) : (
              <>
                <BellRing className="h-4 w-4" /> Start watching
              </>
            )}
          </Button>
        </form>

        {mutation.isSuccess && (
          <p className="mt-3 flex items-center gap-2 text-sm text-fine-foreground">
            <BellRing className="h-4 w-4 shrink-0" />
            Watching {brief.flightNumber}. Changes show up under Watching.
          </p>
        )}
        {mutation.isError && (
          <p className="mt-3 text-sm text-rough">Could not start that watch. Try again.</p>
        )}

        <p className="mt-6 text-xs text-muted-foreground">Watching stops after the trip.</p>
      </div>
    </AppShell>
  );
}
