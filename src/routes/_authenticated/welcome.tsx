import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStandbyProfile, saveStandbyProfile } from "@/lib/aircue/plan.functions";
import { clearDraft, readDraft, resolvedAccess } from "@/lib/aircue/onboarding";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Your first standby day — Standbye" },
      {
        name: "description",
        content: "Your standby profile is saved. Start your first full standby day in Standbye.",
      },
      { property: "og:title", content: "Your first standby day — Standbye" },
      { property: "og:description", content: "Your standby profile is saved and ready." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const navigate = useNavigate();
  const save = useServerFn(saveStandbyProfile);
  const load = useServerFn(getStandbyProfile);
  const [saving, setSaving] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const draft = readDraft();
      try {
        if (draft) {
          await save({
            data: {
              homeAirline: draft.homeAirline,
              travelerType: draft.travelerType,
              airlineAccess: resolvedAccess(draft),
              homeAirports: draft.homeAirport ? [draft.homeAirport.toUpperCase()] : [],
              notifyMode: "meaningful",
              onboarded: true,
              painPoint: draft.painPoint || null,
              accessMode: draft.accessMode,
            },
          });
          clearDraft();
        } else {
          const existing = await load();
          if (!existing?.onboarded) {
            void navigate({ to: "/onboarding", replace: true });
            return;
          }
        }
      } finally {
        setSaving(false);
      }
    })();
  }, [save, load, navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-7 pb-8 pt-20 text-center">
      <div className="flex flex-1 flex-col justify-center">
        <span className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-fine-soft opacity-70 blur-xl"
          />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-fine-soft shadow-card">
            {saving ? (
              <Check className="h-8 w-8 animate-pulse text-fine-foreground" />
            ) : (
              <Gift className="h-8 w-8 text-fine-foreground" />
            )}
          </span>
        </span>

        {!saving && (
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-fine-foreground">
            One full standby day, on us
          </p>
        )}

        <h1
          className={`font-display text-[30px] font-bold leading-[1.12] tracking-tight ${saving ? "mt-8" : "mt-3"}`}
        >
          {saving ? "Saving your profile…" : "Try it on your actual trip"}
        </h1>
        <p className="mx-auto mt-4 max-w-[20rem] text-[16px] leading-relaxed text-muted-foreground">
          {saving
            ? "One moment while Standbye gets set up the way you travel."
            : "Plan a real route, build your options, and let Standbye watch the plan while you get to the airport."}
        </p>
      </div>

      <Button
        size="lg"
        disabled={saving}
        className="h-14 rounded-full text-base font-semibold"
        onClick={() => navigate({ to: "/plan" })}
      >
        Build my first plan
      </Button>
    </main>
  );
}
