import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import mark from "@/assets/standbye-mark.png.asset.json";
import wordmark from "@/assets/standbye-wordmark.png.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readDraft } from "@/lib/aircue/onboarding";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Standbye — standby without the constant checking" },
      {
        name: "description",
        content:
          "Standbye finds the standby flights worth trying, explains what could change, and keeps an eye on your backup options.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Standbye — standby without the constant checking" },
      {
        property: "og:description",
        content:
          "Find the flights worth trying, understand what could change, and know your backup options.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FirstLaunch,
});

function FirstLaunch() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) void navigate({ to: readDraft() ? "/welcome" : "/plan", replace: true });
      else setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);


  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <img src={mark.url} alt="" aria-hidden className="h-10 w-10 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-7 pb-8 pt-24 text-center">
      <div className="flex flex-1 flex-col justify-center">
        <img
          src={wordmark.url}
          alt="Standbye"
          className="mx-auto h-24 w-auto max-w-[280px] object-contain"
        />

        <h1 className="sr-only">Standbye — stop planning standby one flight at a time</h1>

        <p className="mt-10 font-display text-[26px] font-bold leading-[1.15] tracking-tight">
          Stop planning standby one flight at a time.
        </p>

        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
          Tell Standbye where you're trying to go. It helps you decide what to try, adapts when the
          day changes, and uses any load you already have.
        </p>
      </div>

      <Button asChild size="lg" className="h-14 rounded-full text-base font-semibold">
        <Link to="/onboarding">Get started</Link>
      </Button>

      <p className="mt-6 text-sm text-muted-foreground">
        Already use Standbye?{" "}
        <Link to="/auth" className="font-semibold text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
