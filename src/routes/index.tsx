import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Clock,
  Cloud,
  CloudLightning,
  Gauge,
  IdCard,
  AlertCircle,
  User,
  Users,
} from "lucide-react";

import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import mark from "@/assets/aircue-mark.png.asset.json";
import { StatusPill } from "@/components/aircue/StatusPill";
import { SignalRow, type Signal } from "@/components/aircue/SignalRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aircue — See what could interfere" },
      {
        name: "description",
        content:
          "Check a flight for weather, airport disruption, and destination demand that could make a standby trip harder.",
      },
      { property: "og:title", content: "Aircue — See what could interfere" },
      {
        property: "og:description",
        content:
          "Weather, airport disruptions, and destination demand for your standby flight—in one view.",
      },
    ],
  }),
  component: StandbyBrief,
});

const departureSignals: Signal[] = [
  {
    id: "dep-weather",
    icon: Cloud,
    title: "Weather",
    detail: "No meaningful issues detected",
    confidence: "context",
  },
  {
    id: "dep-airport",
    icon: Building2,
    title: "Airport",
    detail: "Operating normally",
    confidence: "context",
  },
];

const arrivalSignals: Signal[] = [
  {
    id: "arr-storms",
    icon: CloudLightning,
    title: "Thunderstorms",
    detail: "Expected near ORD around arrival",
    confidence: "strong",
    why: "Arrival capacity may fall during the flight window, which could delay or hold the flight.",
    source: "NWS · updated 8:20 AM CDT",
  },
  {
    id: "arr-lolla",
    icon: Users,
    title: "Lollapalooza",
    detail: "Large visitor influx expected",
    confidence: "context",
    why: "Inbound demand to Chicago may be elevated before the event begins.",
    source: "Local events · updated today",
  },
  {
    id: "arr-convention",
    icon: IdCard,
    title: "Major convention",
    detail: "35K attendees expected",
    confidence: "context",
    why: "Directional demand may reduce flexibility on later Chicago flights.",
    source: "Local events · updated today",
  },
];

function StandbyBrief() {
  const [flightNumber, setFlightNumber] = useState("UA782");
  const [travelDate, setTravelDate] = useState("Aug 1, 2026");
  const [watching, setWatching] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src={mark.url} alt="" aria-hidden className="h-8 w-8" />
            <img src={wordmark.url} alt="Aircue" className="h-6 w-auto" />
          </div>
          <div className="flex items-center gap-4">
            <button type="button" className="text-sm font-medium hover:text-primary">
              My watches
            </button>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border">
              <User className="h-4 w-4 text-muted-foreground" />
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 pt-8">
        <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              See what could interfere.
            </h1>
            <p className="mt-2 text-muted-foreground">
              Weather, airport disruptions, and destination demand—in one view.
            </p>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="min-w-[9rem] flex-1">
              <Label htmlFor="flight" className="text-xs text-muted-foreground">
                Flight number
              </Label>
              <Input
                id="flight"
                value={flightNumber}
                onChange={(e) => setFlightNumber(e.target.value)}
                className="mt-1.5 h-12 bg-card text-base"
              />
            </div>
            <div className="min-w-[9rem] flex-1">
              <Label htmlFor="date" className="text-xs text-muted-foreground">
                Travel date
              </Label>
              <Input
                id="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                className="mt-1.5 h-12 bg-card text-base"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6 text-base font-semibold">
              Check flight
            </Button>
          </form>
        </section>

        <section className="mt-8 flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-card lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-3">
            <p className="font-display text-3xl font-bold tracking-tight">UA782</p>
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-semibold">
                DEN <span className="text-muted-foreground">→</span> ORD
              </p>
              <p className="text-sm text-muted-foreground">Denver to Chicago</p>
            </div>
            <p className="text-muted-foreground">Aug 1 · 3:15 PM – 6:42 PM</p>
          </div>
          <div className="flex items-center gap-4">
            <StatusPill status="elevated" />
            <Button
              variant={watching ? "secondary" : "outline"}
              size="lg"
              onClick={() => setWatching((v) => !v)}
              className="h-12 border-primary/40 px-5 font-semibold text-primary"
            >
              {watching ? "Watching this flight" : "Watch this flight"}
            </Button>
          </div>
        </section>

        <section className="mt-5 flex items-start gap-4 rounded-xl border border-elevated/60 bg-elevated-soft p-5">
          <AlertCircle className="mt-0.5 h-7 w-7 shrink-0 text-elevated-foreground" />
          <div>
            <p className="font-semibold">Multiple conditions overlap</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Weather disruption and destination demand may reduce flexibility.
            </p>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <article className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Departure
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Denver · DEN</h2>
              </div>
              <StatusPill status="clear" size="sm" />
            </div>
            <div className="mt-4">
              {departureSignals.map((signal) => (
                <SignalRow key={signal.id} signal={signal} tone="calm" />
              ))}
            </div>
          </article>

          <article className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Arrival
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">Chicago · ORD</h2>
              </div>
              <StatusPill status="elevated" size="sm" />
            </div>
            <div className="mt-4">
              {arrivalSignals.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          </article>
        </section>

        <section className="mt-5 rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Flight-specific
          </p>
          <div className="mt-4 grid gap-6 md:grid-cols-2 md:divide-x md:divide-border">
            <div className="flex items-start gap-4">
              <Gauge className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">Combined pressure</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Weather delays could move confirmed travelers onto later flights.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 md:pl-6">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-clear-foreground" />
              <div>
                <p className="font-semibold">Earlier cancellations</p>
                <p className="mt-1 text-sm text-muted-foreground">None detected</p>
              </div>
            </div>
          </div>
        </section>

        <p className="mt-5 text-xs text-muted-foreground">
          Aircue does not include airline load data, standby priority, or a prediction that you
          will receive a seat.
        </p>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Last checked 8:42 AM CDT
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span>FlightAware</span>
            <span aria-hidden>·</span>
            <span>NWS</span>
            <span aria-hidden>·</span>
            <span>FAA</span>
            <span aria-hidden>·</span>
            <span>Local events</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
