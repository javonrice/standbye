import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";

import { AppShell } from "@/components/aircue/AppShell";
import { BriefView } from "@/components/aircue/BriefView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { briefs, defaultBrief, type Brief } from "@/lib/aircue/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aircue — Will standby be hard today?" },
      {
        name: "description",
        content:
          "Type in a flight and we tell you, in plain English, what could make flying standby harder today: weather, delays, cancellations, and busy cities.",
      },
      { property: "og:title", content: "Aircue — Will standby be hard today?" },
      {
        property: "og:description",
        content:
          "Plain-English answers about what could make your standby flight harder. You make the call.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function resolveFlight(flightNumber: string): Brief | undefined {
  const normalized = flightNumber.replace(/\s+/g, "").toUpperCase();
  return briefs.find((b) => b.flightNumber === normalized);
}

function SearchPage() {
  const [flightNumber, setFlightNumber] = useState(defaultBrief.flightNumber);
  const [travelDate, setTravelDate] = useState("2026-08-01");
  const [brief, setBrief] = useState<Brief | undefined>(defaultBrief);
  const [unresolved, setUnresolved] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = resolveFlight(flightNumber);
    if (found) {
      setBrief(found);
      setUnresolved(null);
    } else {
      setBrief(undefined);
      setUnresolved(flightNumber.toUpperCase());
    }
  }

  return (
    <AppShell>
      <section>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Know what could make your standby trip harder.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Aircue watches weather, airport operations, FAA programs, the flight chain, and
          destination demand around a U.S. flight.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="flight" className="text-xs text-muted-foreground">
              Flight number
            </Label>
            <Input
              id="flight"
              value={flightNumber}
              onChange={(e) => setFlightNumber(e.target.value)}
              placeholder="UA782"
              className="mt-1.5 h-12 bg-card text-base"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="date" className="text-xs text-muted-foreground">
              Travel date
            </Label>
            <Input
              id="date"
              type="date"
              value={travelDate}
              onChange={(e) => setTravelDate(e.target.value)}
              className="mt-1.5 h-12 bg-card text-base"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 px-6 text-base font-semibold">
            <Search className="h-4 w-4" /> Check flight
          </Button>
        </form>

        <p className="mt-2 text-xs text-muted-foreground">
          Demo flights: UA782 (Elevated), DL1180 (Clear), AA2210 (Incomplete).
        </p>
      </section>

      <div className="mt-6">
        {brief ? (
          <BriefView key={brief.id} brief={brief} />
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 text-sm shadow-card">
            <p className="font-semibold">We could not resolve {unresolved}</p>
            <p className="mt-1 text-muted-foreground">
              Check the flight number and date. Aircue covers U.S. flights only during the MVP, and
              missing data is never shown as a Clear result.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
