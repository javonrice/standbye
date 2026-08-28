import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchingOverlay } from "@/components/aircue/SearchingOverlay";
import { checkKnownFlight } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/known-flight")({
  head: () => ({
    meta: [
      { title: "Check a specific flight — AirCue" },
      {
        name: "description",
        content:
          "Already know the flight you want to try? Enter the number and AirCue reads that setup for standby.",
      },
      { property: "og:title", content: "Check a specific flight — AirCue" },
      { property: "og:description", content: "Read one specific flight as a standby setup." },
    ],
  }),
  component: KnownFlightPage,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function KnownFlightPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkKnownFlight);

  const [carrier, setCarrier] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [travelDate, setTravelDate] = useState(todayISO());

  const run = useMutation({
    mutationFn: () =>
      check({
        data: {
          carrier: carrier.trim().toUpperCase(),
          flightNumber: flightNumber.trim(),
          travelDate,
        },
      }),
    onSuccess: (res) => {
      if (res.optionId) navigate({ to: "/options/$optionId", params: { optionId: res.optionId } });
      else if (res.planId) navigate({ to: "/plans/$planId", params: { planId: res.planId } });
    },
  });

  const result = run.data;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-xl md:px-10 md:pt-12">
      {run.isPending && (
        <SearchingOverlay origin={carrier.toUpperCase() || "—"} destination={flightNumber || "—"} />
      )}

      <Link to="/plan" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to planning
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
        I already know the flight
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter it and AirCue will read that exact setup, plus what you would have left if it does not
        work.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="flex gap-3">
          <div className="w-28">
            <Label htmlFor="carrier">Airline</Label>
            <Input
              id="carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value.toUpperCase().slice(0, 3))}
              placeholder="UA"
              className="mt-1.5 h-12 uppercase"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="flight">Flight number</Label>
            <Input
              id="flight"
              inputMode="numeric"
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="1448"
              className="mt-1.5 h-12"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="date">Travel date</Label>
          <Input
            id="date"
            type="date"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
            className="mt-1.5 h-12"
          />
        </div>

        <Button
          type="submit"
          className="h-12 w-full"
          disabled={run.isPending || carrier.length < 2 || flightNumber.length < 1}
        >
          Read this setup
        </Button>
      </form>

      {result?.error && (
        <p className="mt-4 text-sm text-muted-foreground">{result.error}</p>
      )}

      {result && !result.error && result.legs.length > 1 && !result.optionId && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">
            That flight number flies more than one leg that day.
          </p>
          <ul className="mt-2 space-y-2">
            {result.legs.map((leg) => (
              <li
                key={`${leg.origin}-${leg.dest}-${leg.depLocal}`}
                className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                {leg.origin} → {leg.dest} · {leg.depLocal} local
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.isError && (
        <p className="mt-4 text-sm text-rough-foreground">
          We could not look that one up. Check the number and date.
        </p>
      )}
    </main>
  );
}
