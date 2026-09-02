import { profileCarriers } from "@/lib/aircue/onboarding";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, PlaneTakeoff, SlidersHorizontal, Users } from "lucide-react";

import homeSky from "@/assets/home-sky.jpg";
import wordmark from "@/assets/standbye-wordmark.png.asset.json";
import { AirportField } from "@/components/aircue/AirportField";
import { Screen } from "@/components/aircue/Layout";
import { PlanBuildingState } from "@/components/aircue/PlanBuildingState";
import { PlanSnapshot } from "@/components/aircue/PlanSnapshot";
import { QueryState } from "@/components/aircue/QueryState";
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
import {
  createPlan,
  getHomePlan,
  getStandbyProfile,
  type PlanSummary,
} from "@/lib/aircue/plan.functions";
import { PlanBuildError } from "@/components/aircue/PlanBuildError";
import { useActivatePlan } from "@/lib/aircue/use-plan-lifecycle";
import {
  routingModeHint,
  routingModeLabel,
  type RoutingMode,
  type StandbyPlan,
} from "@/lib/aircue/standby";

interface HomeSearch {
  /** `?new=1` reveals the builder even when a current Plan exists. */
  new?: true;
}

export const Route = createFileRoute("/_authenticated/plan/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search["new"] === true || search["new"] === "1" ? { new: true } : {},
  head: () => ({
    meta: [
      { title: "Home — Standbye" },
      {
        name: "description",
        content:
          "Your current standby day, or a new plan in four fields. Standbye ranks the realistic ways to get there.",
      },
      { property: "og:title", content: "Home — Standbye" },
      { property: "og:description", content: "Your current standby day in one place." },
    ],
  }),
  component: HomePage,
});

/** Local calendar date, not UTC — otherwise evening users lose "today". */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Current Plan = travel date today or later, soonest date first, and when
 * several share that date, the most recently created. Past Plans never become
 * Home automatically.
 */
export function pickCurrentPlan(plans: PlanSummary[], todayISO: string): PlanSummary | null {
  const upcoming = plans.filter((p) => p.travelDate >= todayISO);
  if (upcoming.length === 0) return null;
  const sorted = [...upcoming].sort((a, b) => {
    if (a.travelDate !== b.travelDate) return a.travelDate < b.travelDate ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  return sorted[0] ?? null;
}

function HomePage() {
  const { new: forceBuilder } = Route.useSearch();
  const loadHomePlan = useServerFn(getHomePlan);
  const loadProfile = useServerFn(getStandbyProfile);
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["standby-profile"],
    queryFn: () => loadProfile(),
  });
  // One round trip: the current Plan and its full briefing together.
  const {
    data: plan,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["home-plan"],
    queryFn: () => loadHomePlan(),
    enabled: !forceBuilder,
  });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding" });
  }, [profile, navigate]);

  if (!forceBuilder && (isLoading || isError)) {
    return (
      <Screen width="lg">
        <QueryState
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          errorTitle="We couldn't load your standby day"
          errorMessage="Standbye couldn't reach the server. Check your connection and try again."
        >
          {null}
        </QueryState>
      </Screen>
    );
  }

  if (!forceBuilder && plan) {
    return <CurrentPlanHome plan={plan} />;
  }

  return (
    <Screen>
      <PlanBuilder />
    </Screen>
  );
}

/**
 * State A — the standby day you are working on, presented as a sheet over an
 * interactive globe drawing the actual flight path, hubs included.
 */
function CurrentPlanHome({ plan }: { plan: StandbyPlan }) {
  const selected = plan.primaryOptionId
    ? (plan.options.find((o) => o.id === plan.primaryOptionId) ?? null)
    : null;
  const current =
    selected ??
    plan.options.find((o) => o.id === plan.preferredOptionId) ??
    plan.options[0] ??
    null;
  const stops = routeStops(plan, current);

  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[#050b1a]">
      <div className="absolute inset-x-0 top-0 h-[62vh]">
        <RouteGlobe stops={stops} />
      </div>

      <img
        src={wordmark.url}
        alt="Standbye"
        className="pointer-events-none absolute left-5 top-6 z-20 h-8 w-auto object-contain drop-shadow-lg md:left-10"
      />

      <div className="pointer-events-none relative z-10 flex min-h-[100dvh] flex-col justify-end">
        <div className="pointer-events-auto mx-auto w-full max-w-md rounded-t-[28px] bg-background px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-16px_40px_-12px_rgba(0,0,0,0.45)] md:max-w-3xl md:px-10">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" aria-hidden />
          <PlanSnapshot plan={plan} />
        </div>
      </div>
    </main>
  );

}

/** State B — the builder: from, to, when, travelers. Everything else is quiet. */
function PlanBuilder() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getStandbyProfile);
  const create = useServerFn(createPlan);
  const activatePlan = useActivatePlan();

  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [date, setDate] = useState(today());
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState("any");
  const [carrierMode, setCarrierMode] = useState("profile");
  const [showPrefs, setShowPrefs] = useState(false);
  const [routingMode, setRoutingMode] = useState<RoutingMode>("best");
  const [nearby, setNearby] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["standby-profile"],
    queryFn: () => loadProfile(),
  });

  useEffect(() => {
    // Prefill home airport once — clearing it must not snap it back.
    if (profile?.homeAirports?.[0] && !prefilled) {
      setPrefilled(true);
      setOrigin((v) => v || profile.homeAirports[0]!);
    }
  }, [profile, prefilled]);

  const accessCodes = profile ? profileCarriers(profile) : [];
  const carriers =
    carrierMode === "profile" ? null : accessCodes.includes(carrierMode) ? [carrierMode] : null;

  const run = useMutation({
    mutationFn: async () => {
      const result = await create({
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
      });
      // Creating a Plan is enough: the top recommendation becomes the current
      // option and monitoring starts, with no extra taps from the traveler.
      await activatePlan(result.planId);
      return result;
    },
    onSuccess: ({ planId }) => navigate({ to: "/plans/$planId", params: { planId } }),
  });

  return (
    <>
      {run.isPending && <PlanBuildingState origin={origin} dest={dest} />}

      <img src={wordmark.url} alt="Standbye" className="h-11 w-auto object-contain md:hidden" />

      <h1 className="mt-6 font-display text-[30px] font-bold leading-[1.15] tracking-tight md:text-[34px]">
        Where are you trying to go?
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        Give us the route and the day. Standbye will rank the realistic ways to get there.
      </p>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <AirportField
            id="origin"
            label="Flying from"
            value={origin}
            icon={PlaneTakeoff}
            onChange={setOrigin}
          />
          <AirportField
            id="dest"
            label="Flying to"
            value={dest}
            icon={MapPin}
            placeholder="LAX"
            onChange={setDest}
          />

          <div className="flex items-center gap-3 px-4 py-3.5">
            <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Label htmlFor="date" className="text-[12px] font-medium text-muted-foreground">
                When
              </Label>
              <Input
                id="date"
                type="date"
                required
                value={date}
                min={today()}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-full border-0 bg-transparent p-0 text-[17px] font-semibold tracking-tight shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3.5">
            <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Label className="text-[12px] font-medium text-muted-foreground">Travelers</Label>
              <Select value={String(travelers)} onValueChange={(v) => setTravelers(Number(v))}>
                <SelectTrigger className="h-8 w-full justify-between border-0 bg-transparent p-0 text-[17px] font-semibold tracking-tight shadow-none focus:ring-0">
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
          </div>
        </div>

        <Button
          type="submit"
          disabled={origin.length !== 3 || dest.length !== 3 || run.isPending}
          className="mt-5 h-14 w-full rounded-2xl text-[16px] font-semibold"
        >
          Build my plan
        </Button>

        {run.isError && <PlanBuildError error={run.error} />}

        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="mt-5 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {showPrefs ? "Hide trip options" : "Trip options"}
        </button>

        {showPrefs && (
          <div className="mt-3 space-y-4 rounded-2xl border border-border bg-surface p-4">
            <div>
              <Label className="text-[12px] font-medium text-muted-foreground">
                Cabin you can list in
              </Label>
              <Select value={cabin} onValueChange={setCabin}>
                <SelectTrigger className="mt-1.5 h-12 rounded-xl bg-card">
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
              <Label className="text-[12px] font-medium text-muted-foreground">
                How wide should we look?
              </Label>
              <Select value={routingMode} onValueChange={(v) => setRoutingMode(v as RoutingMode)}>
                <SelectTrigger className="mt-1.5 h-12 rounded-xl bg-card">
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
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                {routingModeHint[routingMode]} · a connection means clearing standby twice, so
                Standbye only suggests one when the ways onward make up for it.
              </p>
            </div>

            <div>
              <Label className="text-[12px] font-medium text-muted-foreground">
                Nearby airports
              </Label>
              <Select value={nearby ? "yes" : "no"} onValueChange={(v) => setNearby(v === "yes")}>
                <SelectTrigger className="mt-1.5 h-12 rounded-xl bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">Only the airports I chose</SelectItem>
                  <SelectItem value="yes">Include driveable nearby airports</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[12px] font-medium text-muted-foreground">Travel access</Label>
              <Select value={carrierMode} onValueChange={setCarrierMode}>
                <SelectTrigger className="mt-1.5 h-12 rounded-xl bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">
                    Using your travel access
                    {accessCodes.length ? ` (${accessCodes.join(", ")})` : ""}
                  </SelectItem>
                  {accessCodes.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code} only
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </form>

      <p className="mt-5 text-[14px] text-muted-foreground">
        Have a flight number?{" "}
        <Link to="/known-flight" className="font-semibold text-primary">
          Check it →
        </Link>
      </p>
    </>
  );
}
