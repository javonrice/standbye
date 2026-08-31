import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Clock, MapPin, PlaneTakeoff } from "lucide-react";

import { AirportField } from "@/components/aircue/AirportField";
import { SearchingOverlay } from "@/components/aircue/SearchingOverlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";
import { createEscapePlan, getPlan, getStandbyProfile } from "@/lib/aircue/plan.functions";
import { PlanBuildError } from "@/components/aircue/PlanBuildError";
import { cn } from "@/lib/utils";

/** Local calendar date, not UTC — otherwise evening users lose "today". */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const Route = createFileRoute("/_authenticated/escape/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { from?: string; to?: string; date?: string; planId?: string } => ({
    from: typeof search["from"] === "string" ? search["from"] : "",
    to: typeof search["to"] === "string" ? search["to"] : "",
    date: typeof search["date"] === "string" ? search["date"] : "",
    planId: typeof search["planId"] === "string" ? search["planId"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Find another way — Standbye" },
      {
        name: "description",
        content:
          "Standbye looks beyond the usual itinerary for realistic ways to keep you moving today.",
      },
      { property: "og:title", content: "Find another way — Standbye" },
      {
        property: "og:description",
        content: "Realistic ways to keep moving when the normal route is done.",
      },
    ],
  }),
  component: FindAnotherWay,
});

function FindAnotherWay() {
  const navigate = useNavigate();
  const initial = Route.useSearch();
  const loadProfile = useServerFn(getStandbyProfile);
  const loadPlan = useServerFn(getPlan);
  const create = useServerFn(createEscapePlan);

  const planId = initial.planId ?? "";
  const { data: plan } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => loadPlan({ data: { planId } }),
    enabled: planId.length > 0,
  });

  const knownDest = plan?.dest ?? initial.to ?? "";
  const knownDate = plan?.travelDate ?? initial.date ?? "";
  const planScoped = Boolean(planId);

  const [origin, setOrigin] = useState(initial.from ?? "");
  const [dest, setDest] = useState(initial.to ?? "");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState(initial.date ?? today());
  const [depTime, setDepTime] = useState("");

  useQuery({ queryKey: ["standby-profile"], queryFn: () => loadProfile() });

  const effectiveDest = planScoped ? knownDest : dest;

  const run = useMutation({
    mutationFn: () =>
      create({
        data: {
          origin: origin.toUpperCase(),
          dest: effectiveDest.toUpperCase(),
          travelDate: when === "now" ? knownDate || today() : date,
          ...(when === "later" && depTime ? { depTime } : {}),
        },
      }),
    onSuccess: ({ planId: newPlanId }) =>
      navigate({ to: "/escape/$planId", params: { planId: newPlanId } }),
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-6 md:max-w-2xl md:px-10 md:pt-12">
      {run.isPending && <SearchingOverlay phase="escape" origin={origin} dest={effectiveDest} />}

      {planScoped ? (
        <Link
          to="/plans/$planId"
          params={{ planId }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Your plan
        </Link>
      ) : (
        <Link to="/plan" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
      )}

      <h1 className="mt-6 font-display text-[30px] font-bold leading-[1.15] tracking-tight md:text-[34px]">
        Need another way?
      </h1>

      {planScoped ? (
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          You&apos;re trying to get to{" "}
          <span className="font-semibold text-foreground">{knownDest || "your destination"}</span>.
          Same trip — Standbye just looks at more ways to get there.
        </p>
      ) : (
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Standbye will look beyond the usual itinerary for realistic ways to keep you moving.
        </p>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <AirportField
            id="another-way-origin"
            label="Where are you now?"
            value={origin}
            icon={PlaneTakeoff}
            onChange={setOrigin}
          />
          {!planScoped && (
            <AirportField
              id="another-way-dest"
              label="Where do you need to get?"
              value={dest}
              icon={MapPin}
              onChange={setDest}
            />
          )}

          <div className="flex items-start gap-3 px-4 py-3.5">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Label className="text-[12px] font-medium text-muted-foreground">When</Label>
              <div className="mt-2 space-y-2">
                {(
                  [
                    { value: "now", label: "As soon as possible" },
                    { value: "later", label: "Later today or another day" },
                  ] as const
                ).map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setWhen(choice.value)}
                    className="flex w-full items-center gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "flex h-4.5 w-4.5 items-center justify-center rounded-full border-2",
                        when === choice.value ? "border-primary" : "border-muted-foreground/40",
                      )}
                    >
                      {when === choice.value && (
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </span>
                    <span className="text-[15px] font-medium">{choice.label}</span>
                  </button>
                ))}
              </div>

              {when === "later" && (
                <div className="mt-3 flex gap-2">
                  <Input
                    type="date"
                    required
                    value={date}
                    min={today()}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-11 rounded-xl bg-card"
                    aria-label="Travel date"
                  />
                  <Input
                    type="time"
                    value={depTime}
                    onChange={(e) => setDepTime(e.target.value)}
                    className="h-11 rounded-xl bg-card"
                    aria-label="Earliest departure time"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <Button
          type="submit"
          disabled={origin.length !== 3 || effectiveDest.length !== 3 || run.isPending}
          className="mt-5 h-14 w-full rounded-2xl text-[16px] font-semibold"
        >
          Find another way
        </Button>

        {run.isError && <PlanBuildError error={run.error} />}
      </form>
    </main>
  );
}
