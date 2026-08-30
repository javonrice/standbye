# Make the engine match what onboarding promises

Onboarding now tells a strong story. Three parts of that story are ahead of the product. This pass closes the gap, then cleans up the smaller truthfulness and pacing issues.

## P0 — Reported loads actually re-rank the plan

Today `attachLoad` saves the report, re-judges that one option, and returns. Stored ranks never move.

New behavior after a load is saved:

```text
save load
  -> recompute that option's load evidence
  -> re-score the affected option
  -> re-sort all current options in the plan
  -> persist new rank values
  -> compare old #1 vs new #1
```

- No new provider API calls. Re-sorting uses stored scores plus the recomputed score for the option that got the load.
- The user's chosen primary option is never moved automatically. When the new #1 is not the primary, Plan Detail surfaces a "Your best option changed" prompt with a one-tap way to make it primary.
- If the plan is being watched, the rank change is recorded as a plan change event so it shows in Updates like any other meaningful change.

## P0 — Party-aware load interpretation

`loadPillar` currently only does `open - standbys`, so "4 open / 3 listed" reads identically for a solo traveler and a family of four not yet listed.

New interpretation:

```text
partySize        = plan.travelers
effectiveDemand  = listed                        (party already included)
                 = listed + partySize            (party not included)
                 = listed, flagged uncertain     (not sure)
cushion          = open - effectiveDemand
```

- Cushion is judged against party size, not a fixed number: a cushion of 2 is comfortable solo and tight for four.
- Freshness (how long ago it was checked) and source adjust confidence and how much weight the load carries — they never produce a clearance percentage.
- The pillar detail text states what was assumed, e.g. "4 open against 3 listed, plus your party of 4 — no cushion."

## P0 — Real alerts, plus honest copy until they land

Two parts:

1. Soften the onboarding updates screen now to: Standbye keeps checking the plan and puts meaningful changes in Updates. Drop "go do something else, we'll get your attention" until delivery is live.
2. Ship web push: a push-only service worker (no caching of app assets, so instant updates stay instant), a subscribe prompt tied to the existing "Keep me updated" card after the first Watch, stored subscriptions per user, and delivery from the existing watch run when a meaningful plan change event is created. Once delivery is verified, restore the stronger onboarding line.

Push permission is only requested from a deliberate tap, never during onboarding.

## P1 — Stop grading the raw 1–4 booking check

Onboarding examples currently color 3 travelers yellow and 4 travelers green, which re-introduces "4 = good availability."

- Raw booking-check rows render neutral: "Booking check — 4 travelers showing", no colored dot.
- Color moves to interpretation only: "Widest showing among these options", "Tightened since 10:00 AM".
- Same treatment anywhere in the app that renders the raw check with a state color.

## P1 — Remove the fake setup screen

The pre-auth loading screen runs three timers while nothing is saved. Remove it. New tail of the funnel:

```text
No fake odds -> Updates -> Standbye is ready for you -> Save your setup / Auth
  -> real saving screen on /welcome -> First Standby Day included
```

`/welcome` already performs the real profile save, so the animation there is honest. The reveal screen keeps its place, just before auth.

## P1 — Make three teaching moments feel like demonstrations

Keep the screen count; cut the feeling of it. Three screens become small animated sequences instead of static slides:

- Booking check: 1, 2, 3, 4 tick in, then it moves 4 showing -> 2 showing.
- Load: the report drops in and AA1375 visibly moves from #2 to #1.
- The day changes: the earlier flight cancels and the better move slides in.

Each still advances on the user's tap; the animation runs once on entry and respects reduced-motion.

## P2 — Cleanup

- Route metadata "a few quick questions and four short examples" and the `painEcho` "four small stories" line are stale — rewrite both.
- Home airport continue currently only needs 3 characters. Require a resolved airport from the picker (or validate on continue) before enabling continue.
- The personalized reveal shows generic checkmarks and marks partner/ZED on regardless of whether any airline was actually selected. Show the real configuration instead: home airline, count of declared ZED/other airlines, home airport.

## Technical notes

- Re-ranking lives server-side next to `attachLoad` in `plan.server.ts`, reusing the existing scoring helpers and the `plan_options.rank` / `is_current` columns; no schema change and no ranking-algorithm rewrite beyond the load pillar.
- `load-adjust.ts` gains party size, `partyIncluded`, and freshness inputs; callers pass the plan's traveler count. Existing load tests are updated and new cases added for solo vs party-of-four.
- Web push needs a stored subscription table plus VAPID keys as secrets, a `public/sw.js` limited to `push` and `notificationclick`, and a send step inside the existing watch run route. No caching handlers in the service worker.
- Onboarding animation stays inside `src/components/aircue/onboarding/`; mock content stays in `onboarding-examples.ts`.

## Out of scope

Contributor verification, pricing or paywall, email alerts, changes to access eligibility, provider logic, or option identity.
