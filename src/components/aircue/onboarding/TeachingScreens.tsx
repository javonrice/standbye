/** Static teaching screens shown during onboarding. Mock content only. */
import { ArrowRight, Bell, Check, X } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import {
  bookingCheckExample,
  bookingCheckLadder,
  bookingCompare,
  bookingMovement,
  partyReadings,
  rankingAfter,
  rankingBefore,
  stateDot,
  stateText,
  widenedAlternates,
  widenedExample,
  type ExampleFlight,
} from "@/lib/aircue/onboarding-examples";

export function ExampleCard({ flight }: { flight: ExampleFlight }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-display text-base font-bold leading-snug">
            {flight.flightLabel}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{flight.depLocal}</p>
        </div>
        <JudgmentPill judgment={flight.judgment} size="sm" className="shrink-0" />
      </div>
      <dl className="mt-3 space-y-1.5">
        {flight.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-sm">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className={`flex items-center gap-2 font-semibold ${stateText[r.state]}`}>
              <span aria-hidden className={`h-2 w-2 rounded-full ${stateDot[r.state]}`} />
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {flight.footnote}
      </p>
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">{children}</h1>
  );
}

function Arrow() {
  return (
    <p aria-hidden className="py-2 text-center text-muted-foreground">
      ↓
    </p>
  );
}

/** Screen 08 */
export function BookingIsNotEverything({ origin, echo }: { origin: string; echo?: string | undefined }) {
  return (
    <section>
      {echo && <p className="text-sm text-muted-foreground">{echo}</p>}
      <Title>Here's where Standbye thinks differently.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        You're trying to get {origin} → LAX on Saturday.
      </p>
      <div className="mt-4 space-y-3">
        {bookingCheckExample(origin).map((f) => (
          <ExampleCard key={f.flightLabel} flight={f} />
        ))}
      </div>
      <p className="mt-5 text-[15px] font-semibold">
        Standbye may still start with the earlier flight.
      </p>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Because the booking check isn't the whole decision. If the early one doesn't work, you
        still have somewhere to go next.
      </p>
    </section>
  );
}

/** Screen 09 */
export function TheDayChanges({ origin }: { origin: string }) {
  return (
    <section>
      <Title>Then the day changes.</Title>
      <p className="mt-4 text-[15px]">UA222 is still on time. But…</p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="rounded-xl border border-border bg-card px-4 py-2.5 font-semibold">
          An earlier flight cancels
        </li>
        <li className="rounded-xl border border-border bg-card px-4 py-2.5 text-muted-foreground">
          The public booking check tightens
        </li>
        <li className="rounded-xl border border-border bg-card px-4 py-2.5 text-muted-foreground">
          Two backups become less useful
        </li>
      </ul>
      <Arrow />
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Your better move changed
      </p>
      <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-card">
        <JudgmentPill judgment="favorable" size="sm" />
        <p className="mt-2.5 font-display text-lg font-bold">{origin} → DEN → LAX</p>
        <p className="mt-1.5 text-sm text-muted-foreground">3 realistic shots into DEN</p>
        <p className="text-sm text-muted-foreground">5 useful LAX flights after</p>
      </div>
      <p className="mt-5 text-[15px] font-semibold">Standbye isn't watching one flight.</p>
      <p className="mt-1.5 text-sm text-muted-foreground">It's watching your way there.</p>
    </section>
  );
}

/** Screen 10 */
export function AlreadyStuck() {
  return (
    <section>
      <Title>Already stuck somewhere?</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">That happens too.</p>
      <p className="mt-4 text-[15px]">
        You're in DEN. You still need LAX. Your original plan is gone.
      </p>
      <Arrow />
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-primary">
        Widen my plan
      </p>
      <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Where are you now?</p>
          <p className="mt-0.5 font-display text-lg font-bold">DEN</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Where do you still need to go?
          </p>
          <p className="mt-0.5 font-display text-lg font-bold">LAX</p>
        </div>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Standbye looks beyond the original itinerary for realistic ways to keep moving.
      </p>
    </section>
  );
}

/** Screen 11 */
export function WidenedResult() {
  return (
    <section>
      <Title>You're not out of options.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        DEN → LAX · today, leave ASAP
      </p>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-primary">
        Best way forward
      </p>
      <div className="mt-2">
        <ExampleCard flight={widenedExample} />
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Other ways from DEN
      </p>
      <ul className="mt-2 space-y-2">
        {widenedAlternates.map((route) => (
          <li
            key={route}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold"
          >
            <span className="min-w-0 break-words">{route}</span>
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Every leg still starts where you are — connections you probably wouldn't have thought to
        check.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        You don't have to rebuild the trip in your head from scratch.
      </p>

    </section>
  );
}

/** Screen 12 */
export function WhatIsTheBookingCheck() {
  return (
    <section>
      <Title>What's the booking check?</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        Standbye checks whether this exact flight is still being publicly offered for different
        party sizes.
      </p>
      <ul className="mt-5 space-y-2">
        {bookingCheckLadder.map((row) => (
          <li
            key={row.party}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold"
          >
            {row.party}
            <Check aria-hidden className="h-4 w-4 text-muted-foreground" />
          </li>
        ))}
      </ul>
      <Arrow />
      <p className="text-center font-display text-xl font-bold">4 travelers showing</p>
      <p className="mt-5 text-sm text-muted-foreground">
        It does <span className="font-semibold text-foreground">not</span> mean four seats are open
        on the airplane. Four is simply as far as the public check goes.
      </p>
    </section>
  );
}

/** Screen 13 */
export function WhyTheCheckHelps() {
  return (
    <section>
      <Title>One check is only part of the picture.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        It gets more useful when Standbye compares flights and watches how things change.
      </p>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today
      </p>
      <ul className="mt-2 space-y-2">
        {bookingCompare.map((row) => (
          <li
            key={row.flight}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm"
          >
            <span className="font-semibold">{row.flight}</span>
            <span className="text-muted-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-muted-foreground">
        UA203 has the widest public booking signal of those options right now.
      </p>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        And later
      </p>
      <ul className="mt-2 space-y-2">
        {bookingMovement.map((row) => (
          <li
            key={row.at}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5 text-sm"
          >
            <span className="font-semibold">{row.at}</span>
            <span className="text-muted-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-center text-sm font-semibold text-watch-foreground">↓ Tightened</p>
      <p className="mt-5 text-sm text-muted-foreground">
        We use that movement as evidence — not as a count of empty seats.
      </p>
    </section>
  );
}

/** Screen 14 */
export function AddYourLoad({ origin }: { origin: string }) {
  return (
    <section>
      <Title>Have the actual load? Even better.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        Maybe you checked your employee system or StaffTraveler.
      </p>
      <RankList label="Before" items={rankingBefore(origin)} />
      <Arrow />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="font-display text-base font-bold">AA1375</p>
        <p className="mt-1.5 text-sm">18 open · 3 listed</p>
        <p className="text-xs text-muted-foreground">StaffTraveler · 8m ago</p>
      </div>
      <Arrow />
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Your best option changed
      </p>
      <RankList label="After" items={rankingAfter(origin)} highlight="AA1375" />
      <p className="mt-5 text-sm text-muted-foreground">
        Standbye uses what you know to improve the whole plan.
      </p>
    </section>
  );
}

function RankList({
  label,
  items,
  highlight,
}: {
  label: string;
  items: string[];
  highlight?: string;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <ol className="mt-2 space-y-2">
        {items.map((item, i) => (
          <li
            key={item}
            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
              highlight && item.startsWith(highlight)
                ? "border-primary bg-accent font-semibold text-accent-foreground"
                : "border-border bg-card"
            }`}
          >
            <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
            <span className="min-w-0 break-words">{item}</span>
            {highlight && item.startsWith(highlight) && (
              <span aria-hidden className="ml-auto">
                ↑
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Screen 15 */
export function LoadsAreInterpreted() {
  return (
    <section>
      <Title>The same load can mean different things.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        Reported load: 4 open · 3 listed
      </p>
      <div className="mt-5 space-y-3">
        {partyReadings.map((r) => (
          <div key={r.who} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {r.who}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{r.detail}</p>
            <p className={`mt-2 text-[15px] font-semibold ${stateText[r.state]}`}>
              <span aria-hidden className="mr-2">
                {r.emoji}
              </span>
              {r.verdict}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Standbye looks at your party, whether you're already listed, how fresh the load is, and the
        rest of the day.
      </p>
    </section>
  );
}

/** Screen 16 */
export function NoFakeOdds() {
  return (
    <section>
      <Title>One thing Standbye won't do: make up your odds.</Title>
      <div className="relative mx-auto mt-8 w-fit">
        <span className="font-display text-5xl font-bold text-muted-foreground/40 line-through">
          72%
        </span>
        <X className="absolute -right-7 top-3 h-6 w-6 text-rough" />
      </div>
      <p className="mt-8 text-[15px]">We don't know whether you'll clear standby.</p>
      <p className="mt-3 text-sm text-muted-foreground">
        And we won't pretend we do. Standbye shows what looks favorable, what looks shaky, what
        changed, and what you can try next.
      </p>
      <p className="mt-3 text-[15px] font-semibold">The call is still yours.</p>
    </section>
  );
}

/** Screen 17 */
export function UpdatesPreview() {
  return (
    <section>
      <Title>Then go do something else.</Title>
      <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
        You don't need to keep reopening Standbye every five minutes.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Bell aria-hidden className="h-3.5 w-3.5" /> Standbye
        </p>
        <p className="mt-2 font-display text-base font-bold">Your better move changed</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The nonstop tightened. Via DEN now has the stronger setup.
        </p>
        <p className="mt-3 text-sm font-semibold text-primary">See updated plan →</p>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Standbye keeps re-reading the plan while you're watching it. Every change lands in Updates,
        so one look tells you whether anything actually moved.
      </p>
    </section>
  );
}
