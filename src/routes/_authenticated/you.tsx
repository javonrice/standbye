import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { Screen } from "@/components/aircue/Layout";
import { supabase } from "@/integrations/supabase/client";
import { getStandbyProfile } from "@/lib/aircue/plan.functions";
import { travelerTypes } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/you")({
  head: () => ({
    meta: [
      { title: "You — Standbye" },
      {
        name: "description",
        content:
          "Your travel setup: airline access, traveler type, home airports, and how Standbye judges your standby options.",
      },
      { property: "og:title", content: "You — Standbye" },
      { property: "og:description", content: "Your Standbye travel setup and account." },
    ],
  }),
  component: YouPage,
});

function YouPage() {
  const navigate = useNavigate();
  const profileFn = useServerFn(getStandbyProfile);
  const { data: profile } = useQuery({ queryKey: ["standby-profile"], queryFn: () => profileFn() });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    return () => {
      alive = false;
    };
  }, []);

  const travelerLabel =
    travelerTypes.find((t) => t.value === profile?.travelerType)?.label ?? "Not set";

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <Screen>
      <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">You</h1>
      <p className="mt-1.5 text-[15px] text-muted-foreground">
        Standbye reads your options through your travel setup, so keep this current.
      </p>

      <SectionLabel>Travel setup</SectionLabel>
      <Group>
        <SettingRow label="Home airline" value={profile?.homeAirline || "Not set"} />
        <SettingRow label="Traveler type" value={travelerLabel} />
        <SettingRow
          label="Travel access"
          value={
            profile?.airlineAccess.length ? profile.airlineAccess.join(", ") : "Just your airline"
          }
        />
        <SettingRow
          label="Home airport"
          value={profile?.homeAirports.length ? profile.homeAirports.join(", ") : "Not set"}
        />
      </Group>

      <SectionLabel>Notifications</SectionLabel>
      <Group>
        <SettingRow
          label="Plan changes"
          value={profile?.notifyOptin ? "On" : "Off"}
          to="/onboarding"
        />
      </Group>

      <SectionLabel>Standbye</SectionLabel>
      <Group>
        <SettingRow label="How Standbye works" to="/how-it-works" />
      </Group>

      <SectionLabel>Account</SectionLabel>
      <Group>
        <SettingRow label="Signed in as" value={email ?? "—"} />
      </Group>

      <button
        type="button"
        onClick={signOut}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {children}
    </div>
  );
}

function SettingRow({
  label,
  value,
  to,
}: {
  label: string;
  value?: string;
  to?: "/onboarding" | "/how-it-works";
}) {
  const inner = (
    <>
      <span className="text-[15px] font-medium">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {value && (
          <span className="truncate text-[14px] text-muted-foreground">{value}</span>
        )}
        {to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </span>
    </>
  );

  if (!to) {
    return <div className="flex items-center justify-between gap-4 px-4 py-3.5">{inner}</div>;
  }
  return (
    <Link to={to} className="flex items-center justify-between gap-4 px-4 py-3.5">
      {inner}
    </Link>
  );
}
