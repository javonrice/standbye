import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AirCue — Decide which standby to try" },
      {
        name: "description",
        content:
          "AirCue helps airline employees and benefit travelers choose a standby attempt, see backup options, and get told when the plan meaningfully changes.",
      },
      { property: "og:title", content: "AirCue — Decide which standby to try" },
      {
        property: "og:description",
        content:
          "Compare standby setups, add real loads, and watch a plan for meaningful change.",
      },
    ],
  }),
  component: FirstLaunch,
});

const promises = [
  {
    title: "Which standby should I try?",
    body: "AirCue ranks the day's realistic setups instead of showing you a wall of flight statuses.",
  },
  {
    title: "What happens if it fails?",
    body: "Every option carries its recovery room — the backups you would still have left.",
  },
  {
    title: "Did anything change?",
    body: "Watch a plan and AirCue tells you only when the decision itself changes.",
  },
];

function FirstLaunch() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (data.user) navigate({ to: "/plan" });
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-12">
      <img src={mark.url} alt="" aria-hidden className="h-11 w-11 invert" />
      <img src={wordmark.url} alt="AirCue" className="mt-4 h-7 w-auto self-start invert" />

      <h1 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight">
        Standby decisions, made in a minute.
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        Built for nonrev travel. AirCue never guesses whether you will clear — it shows you what
        the setup actually looks like.
      </p>

      <ul className="mt-8 space-y-3">
        {promises.map((p) => (
          <li key={p.title} className="rounded-2xl border border-border bg-card p-4">
            <p className="font-display text-base font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <Button asChild className="h-12 w-full" disabled={checking}>
          <Link to="/auth">Get started</Link>
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          AirCue shows public availability and operating conditions. It is not airline load data
          and never predicts a seat.
        </p>
      </div>
    </main>
  );
}
