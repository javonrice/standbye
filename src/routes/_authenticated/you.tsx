import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, LogOut } from "lucide-react";

import { Screen } from "@/components/aircue/Layout";
import { supabase } from "@/integrations/supabase/client";
import { getStandbyProfile, listCommittedPlans } from "@/lib/aircue/plan.functions";
import { travelerTypes } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/you")({
  head: () => ({
    meta: [
      { title: "You — Standbye" },
      {
        name: "description",
        content:
          "Your travel setup: airline access, traveler type, home airports, and how Standbye judges your standby options.",
      },
      { property: "og:title", content: "You — Standbye" },
      { property: "og:description", content: "Your Standbye travel setup and account." },
    ],
  }),
  component: YouPage,
});

function YouPage() {
  const navigate = useNavigate();
  const profileFn = useServerFn(getStandbyProfile);
  const plansFn = useServerFn(listCommittedPlans);

  const { data: profile } = useQuery({ queryKey: ["standby-profile"], queryFn: () => profileFn() });
  const { data: plans } = useQuery({ queryKey: ["committed-plans"], queryFn: () => plansFn() });

  const travelerLabel =
    travelerTypes.find((t) => t.value === profile?.travelerType)?.label ?? "Not set";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Screen>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">You</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Standbye reads your options through your travel setup, so keep this current.
      </p>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-base font-semibold">Your travel setup</h2>
        <dl className="mt-3 space-y-2.5 text-sm">
          <Row label="Home airline" value={profile?.homeAirline ?? "Not set"} />
          <Row label="Traveler type" value={travelerLabel} />
          <Row
            label="Airline access"
            value={
              profile?.airlineAccess.length ? profile.airlineAccess.join(", ") : "Just your airline"
            }
          />
          <Row
            label="Home airports"
            value={profile?.homeAirports.length ? profile.homeAirports.join(", ") : "Not set"}
          />
        </dl>
        <Link
          to="/onboarding"
          className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium"
        >
          Update my travel setup
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-base font-semibold">Your plans</h2>
        {!plans || plans.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No plans yet. Build a search on Home, then pick a primary or watch a plan.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {plans.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  to="/plans/$planId"
                  params={{ planId: p.id }}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span>
                    <span className="block text-sm font-medium">
                      {p.origin} → {p.dest}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.travelDate}
                      {p.primaryFlightLabel ? ` · Primary ${p.primaryFlightLabel}` : ""}
                      {p.watching ? " · Watching" : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/plans"
          className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium"
        >
          Open Plans
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-base font-semibold">How Standbye thinks</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Standbye reads four things: what is still publicly bookable, how the operation looks today,
          how the route usually behaves, and what backup you would have left. It never claims to
          know your list position or whether you will clear. A load you enter yourself always beats
          what Standbye can infer.
        </p>
        <Link
          to="/how-it-works"
          className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium"
        >
          How Standbye works
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <button
        type="button"
        onClick={signOut}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
