import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { WhatIsTheBookingCheck } from "@/components/aircue/onboarding/TeachingScreens";

const KEY = "standbye.taught.booking-check";

/**
 * Contextual first-use education. The teaching screens used to live inside
 * onboarding; this shows the one that matters the first time a traveler is
 * looking at a real plan. Dismissal is local-only on purpose — a one-time
 * teaching moment is not worth a schema change.
 */
export function FirstUseTeaching() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* private mode — just skip the tip */
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="relative mt-6 rounded-2xl border border-border bg-surface p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 text-muted-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <WhatIsTheBookingCheck />
      <button
        type="button"
        onClick={dismiss}
        className="mt-4 text-[14px] font-semibold text-primary"
      >
        Got it
      </button>
    </section>
  );
}
