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
      "Seats still look open, the day is running normally, and there is another flight behind this one if it slips. This is the kind of setup most people clear on.",
  },
  {
    judgment: "mixed",
    meaning:
      "It can work, but there is less room than you want — fewer open seats, a busy day, or a thin backup. Worth taking if you can handle a wait.",
  },
  {
    judgment: "riskier",
    meaning:
      "Something is clearly working against you: the flight is close to full, the operation is struggling, or there is nothing useful behind it. Only take it if you have a real fallback.",
  },
  {
    judgment: "changed",
    meaning:
      "Something moved after you started watching — a cancellation, a big delay, or seats disappearing. Open it and decide again before you head to the airport.",
  },
];

const inputs = [
  {
    title: "What is still bookable",
    body: "Standbye checks how many seats the airline will still sell on the flight. If almost nothing is left for sale, there is almost nothing left for standby.",
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
            Seat counts come from what is publicly for sale, not from the airline&apos;s standby
            list. A flight can look open and still have a long list.
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
