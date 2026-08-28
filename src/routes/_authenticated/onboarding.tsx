import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AIRLINES } from "@/lib/aircue/airlines";
import { travelerTypes } from "@/lib/aircue/standby";
import { saveStandbyProfile } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Your standby profile — AirCue" },
      {
        name: "description",
        content:
          "Tell AirCue your airline, traveler type, and where you usually start so plans are ranked for your access.",
      },
      { property: "og:title", content: "Your standby profile — AirCue" },
      { property: "og:description", content: "Set up how you travel standby." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const save = useServerFn(saveStandbyProfile);

  const [step, setStep] = useState(0);
  const [homeAirline, setHomeAirline] = useState("UA");
  const [travelerType, setTravelerType] = useState("employee");
  const [access, setAccess] = useState<string[]>(["UA"]);
  const [airports, setAirports] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      save({
        data: {
          homeAirline,
          travelerType,
          airlineAccess: access,
          homeAirports: airports
            .split(/[,\s]+/)
            .map((a) => a.trim().toUpperCase())
            .filter((a) => a.length === 3)
            .slice(0, 6),
          notifyMode: "meaningful",
          onboarded: true,
        },
      }),
    onSuccess: () => navigate({ to: "/plan" }),
  });

  function toggleAccess(code: string) {
    setAccess((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-12 pt-8 md:pt-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Step {step + 1} of 3
      </p>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <section className="mt-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Which airline are you with?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This decides which flights AirCue treats as your home metal.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {AIRLINES.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => {
                  setHomeAirline(a.code);
                  setAccess((prev) => (prev.includes(a.code) ? prev : [...prev, a.code]));
                }}
                className={`rounded-xl border px-3 py-3 text-left text-sm font-semibold ${
                  homeAirline === a.code
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="mt-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">How do you travel?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Traveler type affects how much backup room AirCue thinks you need.
          </p>
          <div className="mt-4 space-y-2">
            {travelerTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTravelerType(t.value)}
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-semibold ${
                  travelerType === t.value
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            What can you actually list on?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick every airline you have travel privileges with, then your usual starting airports.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {AIRLINES.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => toggleAccess(a.code)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                  access.includes(a.code)
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {a.code}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <Label htmlFor="airports">Home airports</Label>
            <Input
              id="airports"
              value={airports}
              onChange={(e) => setAirports(e.target.value.toUpperCase())}
              placeholder="ORD, MDW"
              className="mt-1.5 h-12 uppercase"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Separate with commas. AirCue uses the first one as your default origin.
            </p>
          </div>
        </section>
      )}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        <Button
          type="button"
          className="h-12 flex-1"
          disabled={submit.isPending}
          onClick={() => (step === 2 ? submit.mutate() : setStep(step + 1))}
        >
          {step === 2 ? (submit.isPending ? "Saving…" : "Start planning") : "Continue"}
        </Button>
      </div>
    </main>
  );
}
