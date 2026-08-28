import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AirCue — standby without the constant checking" },
      {
        name: "description",
        content:
          "AirCue finds the standby flights worth trying, explains what could change, and keeps an eye on your backup options.",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "AirCue — standby without the constant checking" },
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
      if (data.user) void navigate({ to: "/plan", replace: true });
      else setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <img src={mark.url} alt="" aria-hidden className="h-10 w-10 animate-pulse invert" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-7 pb-16 pt-16 text-center">
      <img src={mark.url} alt="" aria-hidden className="mx-auto h-14 w-14 invert" />
      <img src={wordmark.url} alt="AirCue" className="mx-auto mt-5 h-8 w-auto invert" />

      <h1 className="sr-only">AirCue — standby without all the constant checking</h1>

      <p className="mt-7 font-display text-xl font-semibold leading-snug">
        Standby without all the constant checking.
      </p>

      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Find the flights worth trying, understand what could change, and know your backup
        options.
      </p>

      <Button asChild size="lg" className="mt-10 h-12 rounded-2xl text-base font-semibold">
        <Link to="/plan">Start planning</Link>
      </Button>

      <p className="mt-6 text-sm text-muted-foreground">
        Already use AirCue?{" "}
        <Link to="/auth" className="font-semibold text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
