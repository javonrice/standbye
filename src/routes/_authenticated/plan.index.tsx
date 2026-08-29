import { profileCarriers } from "@/lib/aircue/onboarding";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  ChevronRight,
  MapPin,
  PlaneTakeoff,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import wordmark from "@/assets/standbye-wordmark.png.asset.json";
import { AirportField } from "@/components/aircue/AirportField";
import { Screen, SectionHeading } from "@/components/aircue/Layout";

import { SearchingOverlay } from "@/components/aircue/SearchingOverlay";
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
  getStandbyProfile,
  listRecentSearches,
  type PlanSummary,
} from "@/lib/aircue/plan.functions";
import { planBuildErrorMessage } from "@/lib/aircue/plan-build-errors";
import { routingModeHint, routingModeLabel, type RoutingMode } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/plan/")({
  head: () => ({
    meta: [
      { title: "Home — Standbye" },
      {
        name: "description",
        content:
          "Build a standby plan for your route and date. Standbye ranks realistic options without promising clearance.",
      },
      { property: "og:title", content: "Home — Standbye" },
      { property: "og:description", content: "Explore and build a standby travel plan." },
    ],
  }),
  component: HomePage,
});

/** Local calendar date, not UTC — otherwise evening users lose "today". */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function HomePage() {
  const navigate = useNavigate();
  const loadProfile = useServerFn(getStandbyProfile);
  const recentFn = useServerFn(listRecentSearches);
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
  const { data: recent } = useQuery({
    queryKey: ["recent-searches"],
    queryFn: () => recentFn(),
  });

  useEffect(() => {
    if (profile && !profile.onboarded) navigate({ to: "/onboarding" });
    if (profile?.homeAirports?.[0] && !origin) setOrigin(profile.homeAirports[0]);
  }, [profile, navigate, origin]);

  const accessCodes = profile ? profileCarriers(profile) : [];
  const carriers =
    carrierMode === "profile"
      ? null
      : accessCodes.includes(carrierMode)
        ? [carrierMode]
        : null;

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
    <Screen>
      {run.isPending && <SearchingOverlay phase="building" origin={origin} dest={dest} />}

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
          <AirportField id="origin" label="Flying from" value={origin} icon={PlaneTakeoff} onChange={setOrigin} />
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
                Travel date
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

        <button
          type="button"
          onClick={() => setShowPrefs((v) => !v)}
          className="mt-4 flex items-center gap-1.5 text-[14px] font-semibold text-primary"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showPrefs ? "Hide search preferences" : "Search preferences"}
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
              <Label className="text-[12px] font-medium text-muted-foreground">Nearby airports</Label>
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

        <Button
          type="submit"
          disabled={origin.length !== 3 || dest.length !== 3 || run.isPending}
          className="mt-5 h-14 w-full rounded-2xl text-[16px] font-semibold"
        >
          Build my plan
        </Button>

        {run.isError && (
          <p className="mt-3 text-[14px] text-rough-foreground">
            {planBuildErrorMessage(run.error)}
          </p>
        )}
      </form>

      <div className="mt-5 space-y-2.5 text-[14px]">
        <p className="text-muted-foreground">
          Stuck right now?{" "}
          <Link to="/escape" className="font-semibold text-primary">
            Widen a plan
          </Link>
        </p>
        <p className="text-muted-foreground">
          Already have a flight in mind?{" "}
          <Link to="/known-flight" className="font-semibold text-primary">
            Start with it
          </Link>
        </p>
      </div>

      {(recent ?? []).length > 0 && (
        <section className="mt-10">
          <SectionHeading
            title="Recent searches"
            tone="quiet"
            hint="Exploration only — pick a primary or watch a plan to save it under Plans."
          />
          <ul className="mt-2 divide-y divide-border/70">
            {(recent ?? []).map((p) => (
              <li key={p.id}>
                <RecentSearchRow plan={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>

  );
}

function RecentSearchRow({ plan: p }: { plan: PlanSummary }) {
  const className = "flex items-center gap-3 py-3 transition-colors hover:opacity-80";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold tracking-tight">
          {p.origin} → {p.dest}
        </span>
        <span className="block text-[12px] text-muted-foreground">
          {p.mode === "escape" ? "Widened · " : ""}
          {p.travelDate}
          {p.optionCount > 0 ? ` · ${p.optionCount} option${p.optionCount === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </>
  );
  return p.mode === "escape" ? (
    <Link to="/escape/$planId" params={{ planId: p.id }} className={className}>
      {body}
    </Link>
  ) : (
    <Link to="/plans/$planId" params={{ planId: p.id }} className={className}>
      {body}
    </Link>
  );
}
