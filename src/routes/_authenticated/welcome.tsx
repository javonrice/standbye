import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getStandbyProfile, saveStandbyProfile } from "@/lib/aircue/plan.functions";
import { clearDraft, readDraft, resolvedAccess, buildAccessMetaFromDraft } from "@/lib/aircue/onboarding";

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
              airlineAccessMeta: buildAccessMetaFromDraft(draft),
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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-7 pb-10 pt-24 text-center">
      <div className="flex flex-1 flex-col justify-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fine-soft shadow-card">
          <Check className={`h-7 w-7 text-fine-foreground ${saving ? "animate-pulse" : ""}`} />
        </span>

        <h1 className="mt-7 font-display text-[30px] font-bold leading-[1.12] tracking-tight">
          {saving ? "Setting you up…" : "You're in."}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
          {saving ? "One moment." : "Your Standbye setup is ready."}
        </p>
      </div>

      <Button
        size="lg"
        disabled={saving}
        className="h-14 rounded-full text-base font-semibold"
        onClick={() => navigate({ to: "/plan", search: { new: true } })}
      >
        Plan my first trip
      </Button>
    </main>
  );
}
