import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { ChoiceButton, OnboardingShell } from "@/components/aircue/OnboardingShell";
import { AirportField } from "@/components/aircue/AirportField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AirlineLogo } from "@/components/aircue/AirlineLogo";
import { ALL_AIRLINE_OPTIONS, airlineName } from "@/lib/aircue/airlines";
import {
  accessModeLabel,
  accessModeHint,
  emptyDraft,
  painEcho,
  painOptions,
  popularAirlines,
  readDraft,
  resolvedAccess,
  saveDraft,
  travelerOptions,
  travelerLabel,
  type AccessMode,
  type OnboardingDraft,
} from "@/lib/aircue/onboarding";


export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up Standbye for how you nonrev" },
      {
        name: "description",
        content:
          "Five quick questions and Standbye is ready to rank your standby day.",
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

const TOTAL = 5;

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

  const body = (() => {
    switch (step) {
      case 0:
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

      case 1:
        return (
          <AirlineStep
            value={draft.homeAirline}
            onPick={(code) => update({ homeAirline: code }, true)}
          />
        );

      case 2:
        return (
          <section>
            <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">
              What can Standbye consider when finding a way there?
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
              You can change this anytime.
            </p>
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
            {draft.accessMode && (
              <p className="mt-3 text-sm text-muted-foreground">
                {accessModeHint[draft.accessMode]}
              </p>
            )}
            {(draft.accessMode === "selected" || draft.accessMode === "partners") && (
              <AccessAirlinePicker
                selected={draft.airlineAccess}
                onToggle={(code) =>
                  update({
                    airlineAccess: draft.airlineAccess.includes(code)
                      ? draft.airlineAccess.filter((c) => c !== code)
                      : [...draft.airlineAccess, code],
                  })
                }
              />
            )}
          </section>
        );

      case 3:
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

      case 4:
        return <RevealStep draft={draft} />;

      default:
        return null;
    }
  })();

  const ctaByStep: Record<number, string> = {
    4: "Save my setup",
  };
  const cta = ctaByStep[step] ?? "Continue";

  const hideCta = step === 0 || step === 1;
  const disabled =
    (step === 2 && !draft.accessMode) || (step === 3 && draft.homeAirport.trim().length !== 3);



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

function AccessAirlinePicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? ALL_AIRLINE_OPTIONS.filter(
          (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
        ).slice(0, 40)
      : ALL_AIRLINE_OPTIONS.filter((a) => popularAirlines.includes(a.code));
    const picked = ALL_AIRLINE_OPTIONS.filter((a) => selected.includes(a.code));
    const seen = new Set(picked.map((a) => a.code));
    return [...picked, ...matches.filter((a) => !seen.has(a.code))];
  }, [query, selected]);

  return (
    <div className="mt-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search airline"
        className="h-12"
        aria-label="Search airline to add access"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {list.map((a) => {
          const on = selected.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              onClick={() => onToggle(a.code)}
              className={`flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-semibold ${
                on
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <AirlineLogo code={a.code} size={24} className="rounded-full" />
              <span>{a.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AirlineStep({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return ALL_AIRLINE_OPTIONS.filter(
        (a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q),
      ).slice(0, 40);
    }
    return ALL_AIRLINE_OPTIONS.filter((a) => popularAirlines.includes(a.code));
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
          <button
            key={a.code}
            type="button"
            onClick={() => onPick(a.code)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-[15px] font-semibold ${
              value === a.code
                ? "border-primary bg-accent text-accent-foreground"
                : "border-border bg-card"
            }`}
          >
            <AirlineLogo code={a.code} size={32} />
            <span className="min-w-0 flex-1 break-words">{a.name}</span>
            <span className="text-xs font-bold text-muted-foreground">{a.code}</span>
          </button>
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


function RevealStep({ draft }: { draft: OnboardingDraft }) {
  const carriers = resolvedAccess(draft);
  const home = draft.homeAirline.trim().toUpperCase();
  const partners = carriers.filter((c) => c !== home);
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
          <ProfileDetail label="Home airline" value={home ? airlineName(home) : "None set"} />
          <ProfileDetail
            label="Also usable"
            value={partners.length > 0 ? partners.join(" · ") : "None added"}
          />
          <ProfileDetail
            label="Default origin"
            value={draft.homeAirport ? draft.homeAirport.toUpperCase() : "None set"}
          />
        </dl>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        When you search, Standbye will rank the options around the way you can actually travel.
      </p>
    </section>
  );
}

function ProfileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

