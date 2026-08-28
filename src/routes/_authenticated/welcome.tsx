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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-fine-soft">
        {saving ? (
          <Check className="h-6 w-6 animate-pulse text-fine-foreground" />
        ) : (
          <Gift className="h-6 w-6 text-fine-foreground" />
        )}
      </span>

      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
        {saving ? "Saving your profile…" : "Your first standby day is on us"}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {saving
          ? "One moment while Standbye gets set up the way you travel."
          : "Plan a route, see the day ranked, and let Standbye watch it while you get to the airport."}
      </p>

      <Button
        size="lg"
        disabled={saving}
        className="mt-9 h-12 rounded-2xl text-base font-semibold"
        onClick={() => navigate({ to: "/plan" })}
      >
        Plan my first standby
      </Button>
    </main>
  );
}
