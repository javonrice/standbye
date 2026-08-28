import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Plane, SlidersHorizontal } from "lucide-react";

import { AirportField } from "@/components/aircue/AirportField";
import { SearchingOverlay } from "@/components/aircue/SearchingOverlay";
import { CueBadge } from "@/components/aircue/CueBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createPlan, getStandbyProfile, listPlans } from "@/lib/aircue/plan.functions";
import { AIRLINES } from "@/lib/aircue/airlines";
import { routingModeHint, routingModeLabel, type Judgment, type RoutingMode } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/plan/")({
  head: () => ({
    meta: [
      { title: "Plan a standby attempt — Standbye" },
      {
        name: "description",
        content:
          "Set your route, date and preferences, and Standbye ranks the day's realistic standby setups.",
      },
      { property: "og:title", content: "Plan a standby attempt — Standbye" },
      { property: "og:description", content: "Ranked standby setups for your route and date." },
    ],
  }),
  component: PlanHome,
});

/** Local calendar date, not UTC — otherwise evening users lose "today". */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function PlanHome() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getStandbyProfile);
  const recent = useServerFn(listPlans);
  const create = useServerFn(createPlan);

  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [date, setDate] = useState(today());
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState("any");
  const [carrierMode, setCarrierMode] = useState("profile");
  const [showPrefs, setShowPrefs] = useState(false);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("best");
  const [nearby, setNearby] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["standby-profile"], queryFn: () => loadProfile() });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => recent() });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding" });
    if (profile?.homeAirports?.[0] && !origin) setOrigin(profile.homeAirports[0]);
  }, [profile, navigate, origin]);

  const carriers =
    carrierMode === "all"
      ? null
      : carrierMode === "profile"
        ? (profile?.airlineAccess?.length ? profile.airlineAccess : null)
        : [carrierMode];

  const run = useMutation({
    mutationFn: () =>
      create({
        data: {
          origin: origin.toUpperCase(),
          dest: dest.toUpperCase(),
          travelDate: date,
          travelers,
          cabin,
          carriers,
          maxStops: routingMode === "nonstop" ? 0 : 1,
          routingMode,
          nearby,
        },
      }),
    onSuccess: ({ planId }) => navigate({ to: "/plans/$planId", params: { planId } }),
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 pt-8 md:max-w-3xl md:px-10 md:pt-12">
      {run.isPending && <SearchingOverlay phase="building" origin={origin} dest={dest} />}

      <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight">
        Plan a standby
      </h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Tell us where you need to get. We'll rank today's realistic shots.
      </p>

      <form
        className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="flex gap-3">
          <AirportField id="origin" label="From" value={origin} onChange={setOrigin} />
          <AirportField id="dest" label="To" value={dest} onChange={setDest} placeholder="LAX" />
        </div>

        <div className="mt-3">
          <Label htmlFor="date" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Input
            id="date"
            type="date"
            required
            value={date}
            min={today()}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 h-12 bg-surface text-base"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showPrefs ? "Hide search preferences" : "Search preferences"}
        </button>

        {showPrefs && (
          <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-3">
            <div>
              <Label className="text-xs text-muted-foreground">Travelers in your party</Label>
              <Select value={String(travelers)} onValueChange={(v) => setTravelers(Number(v))}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} {n === 1 ? "traveler" : "travelers"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Cabin you can list in</Label>
              <Select value={cabin} onValueChange={setCabin}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any cabin</SelectItem>
                  <SelectItem value="economy">Economy only</SelectItem>
                  <SelectItem value="premium">Premium or better</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">How wide should we look?</Label>
              <Select
                value={routingMode}
                onValueChange={(v) => setRoutingMode(v as RoutingMode)}
              >
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["best", "nonstop", "wide"] as RoutingMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {routingModeLabel[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {routingModeHint[routingMode]} · a connection means clearing standby twice, so
                Standbye only suggests one when the ways onward make up for it.
              </p>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Nearby airports</Label>
              <Select value={nearby ? "yes" : "no"} onValueChange={(v) => setNearby(v === "yes")}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Only the airports I chose</SelectItem>
                  <SelectItem value="yes">Include driveable nearby airports</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Airlines</Label>
              <Select value={carrierMode} onValueChange={setCarrierMode}>
                <SelectTrigger className="mt-1.5 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">Airlines I can travel on</SelectItem>
                  <SelectItem value="all">Any airline</SelectItem>
                  {AIRLINES.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.name} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={origin.length !== 3 || dest.length !== 3 || run.isPending}
          className="mt-5 h-14 w-full rounded-2xl text-[16px] font-semibold"
        >
          Find my best shots
        </Button>

        {run.isError && (
          <p className="mt-3 text-sm text-rough-foreground">
            We could not build that plan. Try again in a moment.
          </p>
        )}
      </form>

      <Link
        to="/known-flight"
        className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-4"
      >
        <span className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Plane className="h-4 w-4 text-primary" />
          I already know the flight
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {(plans ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">Recent plans</h2>
          <ul className="mt-2 space-y-2">
            {(plans ?? []).map((p) => (
              <li key={p.id}>
                <Link
                  to="/plans/$planId"
                  params={{ planId: p.id }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5"
                >
                  <span>
                    <span className="block text-[16px] font-semibold">
                      {p.origin} → {p.dest}
                    </span>
                    <span className="block text-[13px] text-muted-foreground">
                      {p.travelDate} · {p.optionCount} option{p.optionCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  {p.bestJudgment && (
                    <CueBadge judgment={p.bestJudgment as Judgment} size="sm" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
