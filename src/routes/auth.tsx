import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import mark from "@/assets/aircue-mark.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — AirCue standby planning" },
      {
        name: "description",
        content:
          "Sign in to AirCue to plan standby attempts, compare setups, and get told when a plan meaningfully changes.",
      },
      { property: "og:title", content: "Sign in — AirCue" },
      {
        property: "og:description",
        content: "Standby planning for airline employees and benefit travelers.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/plan` },
          });
    const { error: authError } = await fn;
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    navigate({ to: "/plan" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <img src={mark.url} alt="" aria-hidden className="h-10 w-10 invert" />
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your AirCue account"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your standby profile, plans, and watches follow you across devices.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 h-12"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-12"
            />
          </div>
          {error && <p className="text-sm text-rough-foreground">{error}</p>}
          <Button type="submit" disabled={busy} className="h-12 w-full">
            {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin"
            ? "New to AirCue? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
