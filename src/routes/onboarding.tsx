import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, X } from "lucide-react";

import { ChoiceButton, OnboardingShell } from "@/components/aircue/OnboardingShell";
import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import { AirportField } from "@/components/aircue/AirportField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AirlineLogo } from "@/components/aircue/AirlineLogo";
import { ALL_AIRLINE_OPTIONS, airlineName } from "@/lib/aircue/airlines";
import {
  accessModeLabel,
  emptyDraft,
  painEcho,
  painOptions,
  popularAirlines,
  readDraft,
  saveDraft,
  travelerOptions,
  travelerLabel,
  type AccessMode,
  type OnboardingDraft,
} from "@/lib/aircue/onboarding";
import {
  exampleOrigin,
  noLoadExample,
  recoveryExample,
  stateDot,
  stateText,
  type ExampleFlight,
} from "@/lib/aircue/onboarding-examples";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up Standbye for how you nonrev" },
      {
        name: "description",
        content:
          "A few quick questions and four short examples, then Standbye is ready to rank your standby day.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Set up Standbye for how you nonrev" },
      {
        property: "og:description",
        content: "Tell Standbye how you travel standby and see how it picks a plan.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OnboardingFlow,
});

const TOTAL = 13;

function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft);

  useEffect(() => {
    const stored = readDraft();
    if (stored) setDraft(stored);
  }, []);

  function update(patch: Partial<OnboardingDraft>, advance = false) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      saveDraft(next);
      return next;
    });
    if (advance) setStep((s) => Math.min(s + 1, TOTAL - 1));
  }

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));
  const back = () => (step === 0 ? navigate({ to: "/" }) : setStep((s) => s - 1));

  const origin = exampleOrigin(draft.homeAirport);

  const body = (() => {
    switch (step) {
      case 0:
        return (
          <Question
            title="What gets old when you nonrev?"
            sub="Pick the one that feels most familiar."
          >
            {painOptions.map((p) => (
              <ChoiceButton
                key={p.value}
                emoji={p.emoji}
                label={p.label}
                selected={draft.painPoint === p.value}
                onClick={() => update({ painPoint: p.value }, true)}
              />
            ))}
          </Question>
        );

      case 1:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              Yeah. We know the routine.
            </h1>
            <ol className="mt-6 space-y-1.5 text-center">
              {[
                "Employee travel portal",
                "StaffTraveler",
                "Airline booking site",
                "Earlier flights",
                "Weather",
                "Check it again",
              ].map((line, i, all) => (
                <li key={line}>
                  <span className="block rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold">
                    {line}
                  </span>
                  {i < all.length - 1 && (
                    <span aria-hidden className="block py-0.5 text-muted-foreground">
                      ↓
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-6 text-[15px] text-muted-foreground">
              And somehow you still end up asking:
            </p>
            <p className="mt-2 font-display text-xl font-bold">“Which one should I try?”</p>
          </section>
        );

      case 2:
        return (
          <Question title="How do you usually travel standby?">
            {travelerOptions.map((t) => (
              <ChoiceButton
                key={t.value}
                emoji={t.emoji}
                label={t.label}
                selected={draft.travelerType === t.value}
                onClick={() => update({ travelerType: t.value }, true)}
              />
            ))}
          </Question>
        );

      case 3:
        return (
          <AirlineStep
            value={draft.homeAirline}
            onPick={(code) => update({ homeAirline: code }, true)}
          />
        );

      case 4:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              What can Standbye consider when finding a way there?
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">You can change this anytime.</p>
            <div className="mt-8 space-y-3">
              {(["home", "partners", "selected"] as AccessMode[]).map((mode) => (
                <ChoiceButton
                  key={mode}
                  label={accessModeLabel[mode]}
                  selected={draft.accessMode === mode}
                  onClick={() => update({ accessMode: mode })}
                />
              ))}
            </div>
            {draft.accessMode === "selected" && (
              <div className="mt-4 flex flex-wrap gap-2">
                {AIRLINES.filter((a) => a.code !== ALL_AIRLINES).map((a) => {
                  const on = draft.airlineAccess.includes(a.code);
                  return (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() =>
                        update({
                          airlineAccess: on
                            ? draft.airlineAccess.filter((c) => c !== a.code)
                            : [...draft.airlineAccess, a.code],
                        })
                      }
                      className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
                        on
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      {a.code}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );

      case 5:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              Where do you usually start?
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
              Standbye uses this as your default origin. One airport is enough for now.
            </p>
            <div className="mt-5">
              <AirportField
                id="home-airport"
                label="Home airport"
                value={draft.homeAirport}
                onChange={(v) => update({ homeAirport: v })}
                placeholder="ORD"
              />
            </div>
          </section>
        );

      case 6:
        return (
          <section>
            {draft.painPoint && (
              <p className="text-sm text-muted-foreground">{painEcho[draft.painPoint]}</p>
            )}
            <h1 className="mt-3 font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              Let's say you're trying to get to LAX.
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{origin} → LAX · Saturday</p>
            <div className="mt-4 space-y-3">
              {recoveryExample(origin).map((f) => (
                <ExampleCard key={f.flightLabel} flight={f} />
              ))}
            </div>
            <p className="mt-5 text-[15px] font-semibold">
              Standbye would rather start with the earlier flight.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Why? If it doesn't work, you still have somewhere to go next.
            </p>
          </section>
        );

      case 7:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              Then the nonstop gets worse.
            </h1>
            <p aria-hidden className="mt-5 text-center text-5xl">
              😬
            </p>
            <p className="mt-5 text-[15px]">UA222 is still on time.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              But an earlier flight cancels and its availability tightens.
            </p>
            <hr className="my-5 border-border" />
            <p className="text-sm text-muted-foreground">Standbye looks again.</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary">
              New best move
            </p>
            <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-card">
              <div className="flex items-center gap-2">
                <JudgmentPill judgment="favorable" size="sm" />
              </div>
              <p className="mt-2.5 font-display text-lg font-bold">
                {origin} → DEN → LAX
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">3 realistic shots into DEN</p>
              <p className="text-sm text-muted-foreground">5 useful LAX flights after</p>
            </div>
            <p className="mt-5 text-[15px] font-semibold">
              Standbye isn't married to one option.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              It watches your whole plan and helps you get where you're going.
            </p>
          </section>
        );

      case 8:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              Can't see that airline's load?
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">That's normal.</p>
            <div className="mt-4">
              <ExampleCard flight={noLoadExample(origin)} />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              Standbye can still give you useful context without pretending it knows the standby
              list.
            </p>
          </section>
        );

      case 9:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              And if you DO have the load… add it.
            </h1>
            <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-card">
              <p className="font-display text-base font-bold">AA1375</p>
              <p className="mt-1.5 text-sm">18 open · 3 listed</p>
              <p className="text-xs text-muted-foreground">StaffTraveler · 8m ago</p>
            </div>
            <p aria-hidden className="py-2 text-center text-muted-foreground">
              ↓
            </p>
            <p className="text-center font-display text-lg font-bold text-fine-foreground">
              Confidence: High
            </p>
            <p className="mt-5 text-sm text-muted-foreground">
              Standbye combines what you know with what it can see. If that changes the best
              option, we'll tell you.
            </p>
          </section>
        );

      case 10:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              One thing Standbye won't do: make up your odds.
            </h1>
            <div className="relative mx-auto mt-8 w-fit">
              <span className="font-display text-5xl font-bold text-muted-foreground/40 line-through">
                72%
              </span>
              <X className="absolute -right-7 top-3 h-6 w-6 text-rough" />
            </div>
            <p className="mt-8 text-[15px]">We don't know whether you'll clear standby.</p>
            <p className="mt-3 text-sm text-muted-foreground">
              If a load is missing, we'll say it's missing. If signals disagree, we'll show that
              too.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              What Standbye gives you is a better read on the decision — not a fake boarding
              prediction.
            </p>
          </section>
        );

      case 11:
        return <SetupStep onDone={next} />;

      case 12:
        return <RevealStep draft={draft} />;

      default:
        return null;
    }
  })();

  const cta =
    step === 1
      ? "Exactly"
      : step === 6
        ? "Got it"
        : step === 10
          ? "I like that"
          : step === 12
            ? "Create my account"
            : "Continue";

  const hideCta = step === 0 || step === 2 || step === 3 || step === 11;
  const disabled =
    (step === 4 && !draft.accessMode) ||
    (step === 5 && draft.homeAirport.trim().length !== 3);


  return (
    <OnboardingShell
      step={step}
      total={TOTAL}
      onBack={back}
      action={
        hideCta ? null : (
          <Button
            className="h-14 w-full rounded-full text-base font-semibold"
            disabled={disabled}
            onClick={() => (step === TOTAL - 1 ? navigate({ to: "/auth" }) : next())}
          >
            {cta}
          </Button>
        )
      }
    >
      {body}
    </OnboardingShell>
  );
}

function Question({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">{title}</h1>
      {sub && <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
      <div className="mt-8 space-y-3">{children}</div>
    </section>
  );
}

function AirlineStep({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const all = AIRLINES.filter((a) => a.code !== ALL_AIRLINES);
    const q = query.trim().toLowerCase();
    if (q) {
      return all.filter(
        (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
      );
    }
    return all.filter((a) => popularAirlines.includes(a.code));
  }, [query]);

  return (
    <section>
      <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
        What's your home airline?
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        This helps Standbye understand the ways you can usually travel.
      </p>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search airline"
        className="mt-4 h-12"
        aria-label="Search airline"
      />
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {query ? "Results" : "Popular"}
      </p>
      <div className="mt-2 space-y-2">
        {list.map((a) => (
          <ChoiceButton
            key={a.code}
            label={a.name}
            selected={value === a.code}
            onClick={() => onPick(a.code)}
          />
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">No airline matches that.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPick("")}
        className="mt-5 w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground"
      >
        I don't have one
      </button>
    </section>
  );
}

function ExampleCard({ flight }: { flight: ExampleFlight }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-display text-base font-bold leading-snug">
            {flight.flightLabel}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{flight.depLocal}</p>
        </div>
        <JudgmentPill judgment={flight.judgment} size="sm" className="shrink-0" />
      </div>
      <dl className="mt-3 space-y-1.5">
        {flight.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className={`flex items-center gap-2 font-semibold ${stateText[r.state]}`}>
              <span aria-hidden className={`h-2 w-2 rounded-full ${stateDot[r.state]}`} />
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {flight.footnote}
      </p>
    </div>
  );
}

function RevealStep({ draft }: { draft: OnboardingDraft }) {
  return (
    <section className="text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fine-soft">
        <Check className="h-6 w-6 text-fine-foreground" />
      </span>
      <h1 className="mt-5 font-display text-[28px] font-bold leading-[1.15] tracking-tight">
        Standbye is ready for you
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Your standby profile</p>

      <div className="mt-5 rounded-2xl border border-border bg-card p-4 text-left shadow-card">
        <p className="font-display text-base font-bold">
          {draft.homeAirline ? airlineName(draft.homeAirline) : "No home airline"}
        </p>
        <p className="text-sm text-muted-foreground">
          {travelerLabel[draft.travelerType] ?? "Traveler"}
          {draft.homeAirport ? ` · ${draft.homeAirport.toUpperCase()}` : ""}
        </p>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
          <ProfileRow label="Home airline" on={Boolean(draft.homeAirline)} />
          <ProfileRow label="Partner / ZED" on={draft.accessMode !== "home"} />
          <ProfileRow label="Connections allowed" on />
        </dl>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        When you search, Standbye will rank the options around the way you can actually travel.
      </p>
    </section>
  );
}

function ProfileRow({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={on ? "text-fine-foreground" : "text-muted-foreground"}>{on ? "✓" : "—"}</dd>
    </div>
  );
}

function SetupStep({ onDone }: { onDone: () => void }) {
  const lines = [
    "Saving how you travel",
    "Learning your usual airports",
    "Getting ready to rank your day",
  ];
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done >= lines.length) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone((d) => d + 1), 700);
    return () => clearTimeout(t);
  }, [done, lines.length, onDone]);

  return (
    <section className="pt-6">
      <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">Setting up Standbye…</h1>
      <ul className="mt-6 space-y-3">
        {lines.map((line, i) => (
          <li key={line} className="flex items-center gap-3 text-[15px]">
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                i < done ? "border-fine bg-fine-soft" : "border-border"
              }`}
            >
              {i < done ? <Check className="h-3.5 w-3.5 text-fine-foreground" /> : null}
            </span>
            <span className={i < done ? "font-semibold" : "text-muted-foreground"}>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
