import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plane, Search, User, X } from "lucide-react";

import earth from "@/assets/home-earth.jpg";
import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import { BottomNav } from "@/components/aircue/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { briefs } from "@/lib/aircue/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aircue — Your standby flights at a glance" },
      {
        name: "description",
        content:
          "Add a flight and Aircue tells you, in plain language, what could make getting on standby harder today.",
      },
      { property: "og:title", content: "Aircue — Your standby flights at a glance" },
      {
        property: "og:description",
        content: "Add a flight and see what could make a standby attempt harder.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeScreen,
});

function HomeScreen() {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.replace(/\s+/g, "").toUpperCase();
    if (!q) return briefs;
    return briefs.filter((b) =>
      [b.flightNumber, b.origin, b.destination, b.originCity, b.destinationCity]
        .join(" ")
        .toUpperCase()
        .replace(/\s+/g, "")
        .includes(q),
    );
  }, [query]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={earth}
        alt=""
        aria-hidden
        width={1024}
        height={1536}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background"
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={mark.url} alt="" aria-hidden className="h-8 w-8 invert" />
            <img src={wordmark.url} alt="Aircue" className="h-5 w-auto invert" />
          </div>
          <button
            type="button"
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/60 text-foreground backdrop-blur-md transition-colors hover:bg-card"
          >
            <User className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-auto rounded-3xl border border-border/60 bg-card/85 p-5 shadow-card backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold tracking-tight">My flights</h1>
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add a flight"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            What could make getting on standby harder today.
          </p>

          <ul className="mt-4 space-y-2.5">
            {briefs.map((b) => (
              <li key={b.id}>
                <Link
                  to="/brief/$briefId"
                  params={{ briefId: b.id }}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-surface/70 p-3.5 transition-colors hover:bg-secondary"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <Plane className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-base font-semibold">{b.flightNumber}</span>
                      <span className="whitespace-nowrap text-sm text-muted-foreground">
                        {b.origin} → {b.destination}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {b.date.replace(/,\s*\d{4}/, "")} · {b.departsLocal}
                    </span>

                  </span>
                  <StatusPill status={b.status} size="sm" className="px-2.5 uppercase" />

                </Link>
              </li>
            ))}
          </ul>

          <Button
            onClick={() => setAdding(true)}
            className="mt-4 h-12 w-full text-sm font-semibold"
          >
            Add a flight
          </Button>

          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
            Aircue never shows seats or your standby position. The judgment stays yours.
          </p>
        </div>
      </div>

      <BottomNav />

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">Add flight</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Enter a flight number or airport
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdding(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="UA782, DEN, or Chicago"
              className="mt-4 h-12 bg-surface text-base"
            />

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested
            </p>

            <ul className="mt-2 space-y-1">
              {results.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      void navigate({ to: "/brief/$briefId", params: { briefId: b.id } });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <Plane className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {b.flightNumber} · {b.originCity} to {b.destinationCity}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {b.date} · {b.departsLocal}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2 py-4 text-sm text-muted-foreground">
                  No match yet. Try UA782, DL1180, or AA2210.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
