import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import type { Judgment } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Standbye works — Standbye" },
      {
        name: "description",
        content:
          "What Standbye actually looks at, what each judgment means, and where its reading can be wrong.",
      },
      { property: "og:title", content: "How Standbye works — Standbye" },
      {
        property: "og:description",
        content: "Plain-language guide to Standbye's standby judgments.",
      },
    ],
  }),
  component: HowItWorks,
});

const judgments: { judgment: Judgment; meaning: string }[] = [
  {
    judgment: "favorable",
    meaning:
      "The overall setup looks stronger right now: public booking, operations, history, recovery, and any reported load are working more in your favor.",
  },
  {
    judgment: "mixed",
    meaning:
      "The setup has tradeoffs. One or more signals are tighter or uncertain, but you may still have useful recovery options.",
  },
  {
    judgment: "riskier",
    meaning:
      "Several signals are working against the plan, or your recovery runway is thin. Worth another look before you commit.",
  },
  {
    judgment: "changed",
    meaning:
      "Something meaningful moved after Standbye checked again — for example public booking tightened, operations worsened, a cancellation changed the day, or another option became stronger.",
  },
];

const inputs = [
  {
    title: "Public booking",
    body: "Standbye checks how large a party the public booking flow still shows as bookable. This is a commercial pressure signal, not the standby load.",
  },
  {
    title: "Reported loads",
    body: "If you add a load from an employee system or another source you trust, Standbye uses that stronger flight-specific evidence in the Plan.",
  },
  {
    title: "How today is running",
    body: "Cancellations, long delays, and the earlier flights on the same route tell us whether the day is normal or already stacking people up.",
  },
  {
    title: "How the route usually behaves",
    body: "Some routes run full and late most of the time. Past behavior sets our expectations before the day even starts.",
  },
  {
    title: "What backup you would have",
    body: "If this one does not work, is there another flight later, or on a nearby airport, that still looks workable? A day with no backup is a riskier day.",
  },
];

function HowItWorks() {
  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link to="/you" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to you
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">How Standbye works</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Standbye does not know your list position and never claims to. It reads the day around your
        flight and tells you, in plain terms, whether the setup is worth your time. The call is
        always yours.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-base font-bold tracking-tight">What the judgments mean</h2>
        <ul className="mt-3 space-y-3">
          {judgments.map((j) => (
            <li key={j.judgment} className="rounded-2xl border border-border bg-card p-4">
              <JudgmentPill judgment={j.judgment} size="sm" />
              <p className="mt-2 text-sm text-foreground/85">{j.meaning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="font-display text-base font-bold tracking-tight">What we look at</h2>
        <ul className="mt-3 space-y-3">
          {inputs.map((i) => (
            <li key={i.title} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">{i.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7 rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-display text-base font-bold tracking-tight">Where we can be wrong</h2>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          <li>
            Public booking can remain open even when the operational load is tight or oversold.
            Standbye does not treat bookability as an exact seat count.
          </li>
          <li>
            Crew, aircraft swaps, and gate-side decisions happen after our last read. Weather can
            turn a clear day in an hour.
          </li>
          <li>
            A load number you enter yourself always beats what Standbye infers. If you see the real
            numbers, report them and we will use yours.
          </li>
        </ul>
      </section>

      <p className="mt-6 text-xs text-muted-foreground">
        Standbye is a read on the day, not a guarantee of a seat.
      </p>
    </main>
  );
}
