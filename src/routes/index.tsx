import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/aircue/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { briefs, searchDisclaimer } from "@/lib/aircue/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aircue — Know what could make your standby trip harder" },
      {
        name: "description",
        content:
          "Check a flight and see, in plain language, what outside conditions could make a standby attempt harder: weather, airport operations, FAA programs, and route cancellations.",
      },
      { property: "og:title", content: "Aircue — Know what could make your standby trip harder" },
      {
        property: "og:description",
        content:
          "Plain-language standby briefs. Aircue does not show seats, list position, or whether you will clear.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const [flightNumber, setFlightNumber] = useState("UA782");
  const [travelDate, setTravelDate] = useState("2026-08-01");
  const [notFoundFor, setNotFoundFor] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = flightNumber.replace(/\s+/g, "").toUpperCase();
    const found = briefs.find((b) => b.flightNumber === normalized);
    if (found) {
      setNotFoundFor(null);
      void navigate({ to: "/brief/$briefId", params: { briefId: found.id } });
    } else {
      setNotFoundFor(normalized);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">
          Know what could make your standby trip harder.
        </h1>

        <form onSubmit={handleSubmit} className="mt-6">
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

          <Label htmlFor="date" className="mt-4 block text-xs text-muted-foreground">
            Travel date
          </Label>
          <Input
            id="date"
            type="date"
            value={travelDate}
            onChange={(e) => setTravelDate(e.target.value)}
            className="mt-1.5 h-12 bg-card text-base"
          />

          <Button type="submit" className="mt-5 h-12 w-full text-sm font-semibold">
            Check this flight
          </Button>
        </form>

        {notFoundFor && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm shadow-card">
            <p className="font-semibold">We could not find {notFoundFor}</p>
            <p className="mt-1 text-muted-foreground">
              Try UA782, DL1180, or AA2210. We would rather say nothing than guess.
            </p>
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{searchDisclaimer}</p>
      </div>
    </AppShell>
  );
}
