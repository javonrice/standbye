import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { readDraft } from "@/lib/aircue/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import mark from "@/assets/standbye-mark.png.asset.json";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Standbye standby planning" },
      {
        name: "description",
        content:
          "Sign in to Standbye to plan standby attempts, compare setups, and get told when a plan meaningfully changes.",
      },
      { property: "og:title", content: "Sign in — Standbye" },
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
  const [showEmail, setShowEmail] = useState(false);
  const moved = useRef(false);

  // A session can arrive from the Google popup/redirect without this component
  // knowing about it — move on as soon as one exists.
  useEffect(() => {
    const go = () => {
      if (moved.current) return;
      moved.current = true;
      void navigate({ to: readDraft() ? "/welcome" : "/plan", replace: true });
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);


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
            options: { emailRedirectTo: `${window.location.origin}/welcome` },
          });
    const { error: authError } = await fn;
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    navigate({ to: readDraft() ? "/welcome" : "/plan" });
  }

  const draft = readDraft();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-8 pt-16">
      <div className="flex-1">
        <img src={mark.url} alt="" aria-hidden className="h-9 w-9 object-contain" />
        <h1 className="mt-8 font-display text-[32px] font-bold leading-[1.1] tracking-tight">
          {mode === "signin" ? "Welcome back" : "Save your setup"}
        </h1>
        <p className="mt-4 max-w-[19rem] text-[16px] leading-relaxed text-muted-foreground">
          {mode === "signin"
            ? "Your standby profile, plans, and watches are waiting."
            : draft
              ? "So your standby profile, plans, and watches are here the next time you travel."
              : "So your standby profile, plans, and watches follow you across devices."}
        </p>
      </div>

      <div className="space-y-3">
        {error && <p className="text-sm text-rough-foreground">{error}</p>}

        <Button
          type="button"
          variant="outline"
          className="h-14 w-full rounded-full text-base font-semibold"
          onClick={() => {
            setError(null);
            void lovable.auth
              .signInWithOAuth("google", { redirect_uri: window.location.origin })
              .then((result) => {
                if (result.error) {
                  setError("We could not finish Google sign-in. Try again.");
                  return;
                }
                if (result.redirected) return;
                navigate({ to: readDraft() ? "/welcome" : "/plan" });
              });
          }}
        >
          Continue with Google
        </Button>

        {showEmail ? (
          <form onSubmit={submit} className="space-y-3 pt-1">
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
            <Button
              type="submit"
              disabled={busy}
              className="h-14 w-full rounded-full text-base font-semibold"
            >
              {busy ? "One moment\u2026" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-14 w-full rounded-full text-base font-semibold"
            onClick={() => setShowEmail(true)}
          >
            Continue with email
          </Button>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="w-full pt-2 text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? (
            <>
              New to Standbye?{" "}
              <span className="font-semibold text-foreground underline underline-offset-4">
                Create an account
              </span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span className="font-semibold text-foreground underline underline-offset-4">
                Sign in
              </span>
            </>
          )}
        </button>
      </div>
    </main>
  );
}
