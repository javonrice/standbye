import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BellOff } from "lucide-react";

import { StatusPill } from "@/components/aircue/StatusPill";
import { listWatches, stopWatch } from "@/lib/aircue/brief.functions";
import { getDeviceId } from "@/lib/aircue/device";
import type { BriefStatus } from "@/lib/aircue/data";

export const Route = createFileRoute("/watches")({
  head: () => ({
    meta: [
      { title: "Watching — Aircue" },
      {
        name: "description",
        content:
          "Flights Aircue is watching for you, with the latest standby pressure status and the most recent change on each one.",
      },
      { property: "og:title", content: "Watching — Aircue" },
      {
        property: "og:description",
        content: "Your watched standby flights and what changed most recently.",
      },
    ],
  }),
  component: WatchesPage,
});

function WatchesPage() {
  const [deviceId, setDeviceId] = useState("");
  const list = useServerFn(listWatches);
  const stop = useServerFn(stopWatch);
  const queryClient = useQueryClient();

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const { data: watches, isLoading } = useQuery({
    queryKey: ["watches", deviceId],
    queryFn: () => list({ data: { deviceId } }),
    enabled: deviceId.length > 0,
  });

  const end = useMutation({
    mutationFn: (watchId: string) => stop({ data: { watchId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watches"] }),
  });

  const active = (watches ?? []).filter((w) => w.state === "active");
  const ended = (watches ?? []).filter((w) => w.state !== "active");

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md px-4 pb-12 pt-8 md:max-w-4xl md:px-10 md:pt-12">
        <h1 className="font-display text-2xl font-bold tracking-tight">Watching</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aircue rechecks these flights and flags meaningful changes.
        </p>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading your watches…</p>}

        {!isLoading && active.length === 0 && ended.length === 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              You are not watching anything yet. Check a flight, then tap Watch on its brief.
            </p>
            <Link to="/" className="mt-3 inline-block text-sm font-semibold text-primary">
              Check a flight
            </Link>
          </div>
        )}

        <ul className="mt-5 space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {active.map((w) => (
            <li key={w.watchId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold">
                    {w.flightLabel} · {w.origin} → {w.destination}
                  </p>
                  <p className="text-xs text-muted-foreground">{w.travelDate}</p>
                </div>
                <StatusPill status={w.status as BriefStatus} size="sm" />
              </div>

              <p className="mt-2 text-sm text-foreground/85">{w.lastChange ?? w.headline}</p>

              <div className="mt-3 flex items-center justify-between">
                <Link
                  to="/brief/$briefId"
                  params={{ briefId: w.tripId }}
                  className="flex items-center gap-1 text-sm font-semibold text-primary"
                >
                  Open brief <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => end.mutate(w.watchId)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <BellOff className="h-4 w-4" /> Stop
                </button>
              </div>
            </li>
          ))}
        </ul>

        {ended.length > 0 && (
          <>
            <h2 className="mt-8 font-display text-base font-bold tracking-tight">Ended</h2>
            <ul className="mt-2 space-y-2">
              {ended.map((w) => (
                <li key={w.watchId} className="rounded-xl border border-border/60 px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {w.flightLabel} · {w.origin} → {w.destination} · {w.travelDate}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
