# Standbye V2 UX Architecture — source spec

Captured 2026-08-30. This is the reference document for the V2 information-architecture
and UX-lifecycle pass. It is a specification, not a changelog. Implementation sequencing
lives in `docs/v2-ux-implementation-plan.md`.

## Product principle

A Standbye user should make one decision at a time. Never require them to understand our
internal data model in order to know where to go next.

The new user mental model:

1. I make a plan.
2. Standbye tells me what makes the most sense to try.
3. My entire standby day lives inside that Plan.
4. If something changes, the Plan changes.
5. If I know actual loads, I add them to the Plan.
6. If my original strategy goes bad, I Find Another Way from inside the same Plan.
7. When the trip is over, it moves into Plans history.

Concepts the traveler must never be asked to learn: search, plan vs committed plan,
primary option, preferred option, watching, watch, updates, ways, escape, availability,
recovery routes, gateway objects.

Constraints for the pass: mobile-first; preserve the ranking engine, flight-data
providers, plan building, reported loads, screenshot parsing, travel-access rules,
gateway logic, recovery logic and event/watch infrastructure; add no new features; no
brand redesign; reuse existing components.

## Global navigation

```text
┌───────────────────────────────────┐
│           SCREEN CONTENT          │
├───────────────────────────────────┤
│   🏠 Home      🗺 Plans      👤 You │
└───────────────────────────────────┘
```

Change `Home / Plans / Updates / You` → `Home / Plans / You`.
Updates are activity on a Plan, not a product object. Native-size, safe-area-aware
touch targets.

### Navigation ownership

Plans is the *library*. Viewing one Plan, or doing anything scoped to one Plan, is the
*current-Plan* experience and belongs to Home.

| URL | Selected tab |
| --- | --- |
| `/plan`, `/known-flight` | Home |
| `/plans/$planId` and every descendant (`/loads`, `/compare`, `/ways`) | Home |
| `/options/$optionId` and its evidence/load subroutes | Home |
| `/updates/$watchId` (Activity), `/escape*` | Home |
| `/plans` (the library index only) | Plans |
| `/you` and `/how-it-works` | You |

Consequence: `/plans` must match exactly, and the Plans tab must not light up for
`/plans/…` children. Tab selection is a matcher concern only — no route moves, no URL
changes, no redirects.


## 1. Marketing entry — `/`

One sentence, one action. No feature carousel, no data-source explanation, no
"AI-powered".

```text
            STANDBYE

   Stop planning standby
   one flight at a time.

   Tell us where you're trying to go.
   We'll help you figure out the best
   way to try it.

  [        Get started            ]
          I already have an account
```

## 2. Onboarding — `/onboarding`

Reduce mandatory onboarding to ~5 screens.

- 2A Traveler type (1 of 5): Employee / Companion or enrolled friend / Family or
  dependent / Other standby traveler. One tap auto-advances.
- 2B Home airline (2 of 5): search field + popular list (UA, AA, DL, WN, AS) +
  "I don't have one". Keep the existing picker.
- 2C Travel access (3 of 5): My airline / My airline + partner/ZED access / I'll choose
  my airlines. Advanced selection expands only when chosen.
- 2D Home airport (4 of 5): single airport field, used as the default origin.
- 2E Ready (5 of 5): checkmark, "Standbye is ready.", personalized recap lines
  (United employee · ORD home airport · Partner travel included), CTA
  "Plan my first trip".

Do not delete the educational screens. Move them to contextual first-use education:

| Teaching | New trigger |
| --- | --- |
| Booking check | first time it appears |
| Widen | first bad plan |
| Loads | first load contribution |
| Monitoring | after first plan |
| No fake odds | inside How Standbye Works |

Persistence rule: contextual first-use education must not require a database migration.
Use an existing profile flag where one already fits, otherwise local persistence
(`localStorage`, alongside the existing onboarding draft) is acceptable for one-time
teaching. Any proposal to persist new education state server-side is flagged for review
before it is coded.

## 3. Auth — `/auth`

Standard. "Save your standby plans across devices." Google button, divider, email,
Continue, "Already have an account? Sign in."

## 4. Welcome — `/welcome`

Extremely short transition: ✓ / "You're in." / "Your Standbye setup is ready." /
[Plan my first trip] → `/plan`.

## 5. Home — `/plan`

Home has two states. It is not always a blank builder.

A Plan is **current** when its travel date is today or later. Home shows the most
relevant current Plan: soonest travel date; if multiple Plans share that date, the most
recently created one wins (using the existing `createdAt` field on `PlanSummary`).
There is no "committed" test — a Plan does not need a chosen option or an explicit watch
to be current.

Scope note: `PlanSummary` exposes no `updatedAt` or archive flag today, and this pass
adds neither. No server fields and no migration. If a future explicit archive or
current-plan lifecycle is added, it can replace this heuristic later; it is out of scope
here.

"Plan another trip" only reveals the builder. It never replaces, deletes, archives, or
demotes the existing current Plan — that Plan stays in Home and Plans untouched.

Plan existence is independent of Plan state: a Plan is real the moment it is
successfully built. A selected/current option is optional Plan state; a watch is
optional system state. Neither determines whether the Plan appears in Home or Plans.
`primary_option_id`, preferred ranking and watch records may continue to exist
internally, but they must never decide whether the user perceives a Plan as "real."

### 5A. Home with a current Plan (the default returning state)

Plan-first. Home renders the Plan itself, in the same order as Plan Detail:

```text
STANDBYE                         ◯
ORD → LAX
Today · 1 traveler
● Plan looks workable

YOUR CURRENT PLAN
┌─────────────────────────────────────┐
│ United · UA 1847                    │
│  9:10 AM   ORD  →  LAX   11:35 AM   │
│ Looks workable                      │
│              See why →              │
└─────────────────────────────────────┘

Standbye is watching the day.
Nothing important has changed.
Checked 4 minutes ago            Activity →

──────── BACKUP OPTIONS ────────
2  UA 2201  10:25 AM → 12:44 PM  >
3  UA 267   11:40 AM → 2:03 PM   >

[ 📷 Add load information ]
[ ↗ Find another way ]
See every route →

Plan another trip →
        HOME   PLANS   YOU
```

"Plan another trip" is the only secondary action, and it is what reveals the builder.

### 5B. Home with no current Plan (the builder)

```text
STANDBYE                         ◯
Where are you trying to go?
┌───────────────────────────────┐
│ ✈ Flying from      ORD        │
│ ● Flying to        LAX        │
│ 📅 When            Today      │
│ 👤 Travelers       1 traveler │
└───────────────────────────────┘
[        Build my plan          ]
Have a flight number?  Check it →
        HOME   PLANS   YOU
```

The builder is shown when there is no current Plan, or when the user taps "Plan another
trip" from 5A. Removed from the primary hierarchy either way: recent searches, Widen,
routing mode, nearby airports, cabin, carrier picker. If advanced controls must stay
reachable, put them behind one quiet "Trip options" sheet.


## 6. Known flight — `/known-flight`

An alternate way to start a Plan, not a separate feature. Airline + flight number +
date, CTA "Build around this", output joins the normal Plan lifecycle.

## 7. Building state

Transitional UI, not a route.

```text
ORD  ─────────────────────→  LAX
Building your standby plan…
✓ Checking today's flights
✓ Looking at realistic backups
◌ Reading today's conditions
Finding the ways that actually make sense.
```

## 8. Plan detail — `/plans/$planId`

The core product. Conceptual order:

1. Route
2. Date / travelers
3. Overall plan state
4. YOUR CURRENT PLAN (dominant card)
5. Monitoring state / important changes
6. Backup options
7. Add load
8. Find another way
9. Every route
10. Activity

```text
←                               •••
ORD → LAX
Today · 1 traveler
● Plan looks workable

YOUR CURRENT PLAN
┌─────────────────────────────────────┐
│ United                         UA   │
│ UA 1847                             │
│  9:10 AM                11:35 AM    │
│    ORD          →          LAX      │
│ Looks workable                      │
│ Booking check       4 travelers ✓   │
│ Operations          Normal          │
│ Backup runway       3 later shots   │
│              See why →              │
└─────────────────────────────────────┘

Standbye is watching the day.
Nothing important has changed.
Checked 4 minutes ago            Activity →

──────── BACKUP OPTIONS ────────
2  UA 2201  10:25 AM → 12:44 PM  2 later shots >
3  UA 267   11:40 AM → 2:03 PM   1 later shot  >

──────── YOUR PLAN ────────
[ 📷 Add load information — Make this plan smarter ]
[ ↗ Find another way — Widen this plan ]
See every route →
Plan another trip
```

Language: "Your current plan" not "Your primary option"; "Use this option" not "Make
this my primary option". Do not expose preferredOption vs primaryOption semantics. Watch
controls are a property of the Plan, not the emotional center.

### 8.1 Plan monitoring lifecycle

There is no Watch CTA in V2. A Plan that is current is monitored — that is what makes
the line "Standbye is watching the day" honest. So a newly built Plan enters the
*existing* monitoring lifecycle automatically, using the existing watch infrastructure
(`startWatchPlan` / `beginWatch`, plan-scoped, existing modes, existing event types).

Rules:

- Monitoring is a property of a current Plan, never a mode the user manages. No start,
  stop, or "not watching" surface.
- Monitoring ≠ permission to interrupt. Notification opt-in stays a separate, explicit
  setting under You → Notifications. Automatic monitoring must not enable any delivery
  channel the user has not agreed to.
- Monitoring ends the way it already does when a Plan is no longer current.
- The watch engine, its cadence, its economics and its event semantics are not
  redesigned in this pass.

Flagged before implementation: the smallest change that makes this true is calling the
existing plan-scoped monitoring start once, at Plan creation, with a non-notifying mode,
instead of behind a user tap. If the existing modes cannot express "monitor without
notifying", that is a real behavioral question and stops for review rather than being
solved by inventing a mode.


## 9. Changed-plan state — same route

Surface the change at the top of the Plan; never route through Updates first.

```text
● Something changed
YOUR CURRENT PLAN   UA 1847  9:10 AM → 11:35 AM
┌─────────────────────────────────────┐
│ Worth another look                  │
│ UA 2201 is now the better move.     │
│ Your current option lost most of    │
│ its remaining backup runway.        │
│ [ Review the change ]               │
└─────────────────────────────────────┘
RECOMMENDED NOW
UA 2201  10:25 AM → 12:44 PM
[        Use this option        ]
Keep UA 1847
```

## 10. Option detail — `/options/$optionId`

Flatten the evidence tree.

```text
← ORD → LAX
UA 2201
ORD  10:25 AM   →   LAX  12:44 PM
        ● Looks workable

Why this ranks here
  Booking check   4 travelers still showing   ›
  Operations      ORD and LAX normal          ›
  Backup runway   2 useful later flights      ›

REPORTED LOAD
9 open · 4 listed · Checked 8m ago
Update load →

MORE CONTEXT
Route history >   Weather >   Holiday demand >

[        Use this option        ]
```

## 11. Evidence subroutes

`/options/$optionId/availability`, `/context/weather`, `/context/history`,
`/context/holiday`, `/recovery` may remain as URLs but should present as bottom sheets /
pushed native panels, e.g.:

```text
═══
Booking check
✓ ✓ ✓ ✓
4 travelers are still showing available for public booking.
This does not mean 4 open seats. It is one demand signal
Standbye uses when comparing flights.
Last checked 4 minutes ago
              Done
```

## 12. Add loads — `/plans/$planId/loads`

A task, not a product area.

- Entry: "How do you want to add it?" → [📷 Upload screenshot] / [⌨ Enter manually]
- Screenshot: choose screenshot → "Are your travelers already included in the standby
  count?" Yes / No / Not sure → [Read screenshot]
- Manual: choose flight, open seats, listed standbys, cabin, party included
- Payoff: ✓ "Plan updated" / "UA 1847 moved from #3 → #1" / [Back to my plan]

`/options/$optionId/load` reuses the identical UI.

## 13. Plans — `/plans`

Only job: my travel plans — **all** of them.

V2 drops the committed/uncommitted split as product behavior, not just as wording. Every
Plan the user built appears here. A Plan never has to earn its place by having a chosen
option or an explicit watch, and nothing the user built silently disappears. "Recent
searches" and "uncommitted exploration" cease to exist as user-facing concepts.

Sections ACTIVE / UPCOMING / PAST, derived from travel date and current plan state. Each
row: route, date, current flight if relevant, one simple state (All quiet · Worth another
look · Plan looks workable · Completed). Never show committed, watching, not watching,
preferred option ID, watch ID.



## 14. Compare — `/plans/$planId/compare`

Optional power-user behavior, not a core CTA. Max two options at a time on mobile. Rows:
overall, booking, operations, backup runway, arrival. Close with "Standbye currently
prefers UA 1847 because you leave earlier without sacrificing your backups." and
[Use UA 1847]. Avoid a horizontally scrolling spreadsheet.

## 15. Every way there — `/plans/$planId/ways`

Advanced exploration after the ranked list. Sections NONSTOP and CONNECTIONS; each
connection summarizes "Via DEN · 3 ways into DEN · 5 onward options · Strong recovery".
Keep the warning that a connection means clearing standby twice.

## 16. Find another way — `/escape`

Not a separate mini-product. Launched from a Plan, which already knows destination,
date, travelers and access. Ask at most "Where are you now?" and "As soon as possible /
Later today", then run the existing widened-plan logic.

## 17. Widen results — `/escape/$planId`

"Another way to LAX". BEST WAY FORWARD (via DEN: ways in, onward choices, recovery
quality, See this route →), then OTHER WAYS, then "Still considering nonstop?" with the
original nonstops, then "Try a specific connection →". It is the same Plan widened.

## 18. Specific connection — `/escape/$planId/via/$hub`

Leg 1 / connection time / Leg 2, "Why this works" checklist, [Use this route].

## 19. Activity — `/updates/$watchId`

Rename the concept from Updates to Activity; it belongs to one Plan.

```text
← Your plan
Activity — ORD → LAX, Today
NOW ● Plan looks workable · Checked 4 minutes ago
● 3:42 PM  UA 2201 moved ahead of UA 1847 — backup runway improved
● 2:18 PM  Booking check tightened — UA 1847: 4 → 2 travelers showing
● 12:04 PM Plan started — UA 1847 was your best option
Nothing you need to do right now.
```

## 20. `/updates`

Remove from navigation. Keep the route for legacy links (redirect to Home/Plans);
possibly a bell-icon inbox later. Do not delete backend event/watch infrastructure.

## 21. You — `/you`

No Plans list. Sections: TRAVEL SETUP (home airline, traveler type, travel access, home
airport), NOTIFICATIONS (plan changes, load requests), STANDBYE (How Standbye works,
Help, Privacy), ACCOUNT (email, sign out).

## 22. How Standbye works — `/how-it-works`

Home for trust education: booking check, today's operation, route behavior, backup
runway, loads you provide. And explicitly: Standbye never invents seat counts, never
shows fake clearance odds, never claims to know list position.

## 23. Legacy watching routes

`/watching → /plans`, `/watching/$watchId → /updates/$watchId`. The word "Watching"
never appears as a product section.

## Final route map

```text
/
├── /onboarding
├── /auth
└── /welcome → /plan                       HOME
        ├── /known-flight
        └── /plans/$planId                 MY PLAN
               ├── /options/$optionId  (+ evidence sheets)
               ├── /plans/$planId/loads
               ├── /plans/$planId/compare
               ├── /plans/$planId/ways
               ├── /updates/$watchId       ACTIVITY
               └── /escape                 FIND ANOTHER WAY
                      └── /escape/$planId/via/$hub
/plans                                     PLAN LIBRARY
/you                                       PROFILE
└── /how-it-works
```

No longer primary: `/updates`, `/watching`, `/watching/$watchId`, and the five option
evidence routes.

## Interaction models borrowed from Flighty (mental models only, not visuals)

1. Creation disappears once the object exists — https://mobbin.com/flows/cb376bea-e4c7-4d9e-91d8-d0b493ec370d
2. The trip is the interface — https://mobbin.com/screens/939d5aae-4c27-4a32-b91c-767ee82a1845
3. Simple flight list density — https://mobbin.com/screens/825ddb50-aa6f-499a-b71b-e556afe93f5e
4. Focused flight detail — https://mobbin.com/screens/0f1d7f88-cd0a-4921-ada2-0df15f4cd6cd
5. Supporting intelligence beneath the trip ("Good to Know") — https://mobbin.com/screens/d120dac5-8bed-4ffe-bd10-a3b93ae5e617

## Visual / interaction rules

Mobile-first, native-feeling. One dominant action per screen. Heavy progressive
disclosure. No dashboards, no cards inside cards, no status chip for every state, no
small text-heavy panels. Every screen answers in under two seconds: where am I, what is
happening, what should I do next.

## Acceptance stories

- First user: landing → onboarding → auth → first plan
- Normal plan: Home → build → Plan → inspect option → use option
- Load: Plan → screenshot → ranking update → back to Plan
- Recovery: Plan → Find another way → alternate route → choose option
- Change: active Plan → meaningful change at top → switch option → Activity
- Returning user: open app → active plan immediately
- History: Plans → upcoming → past
- Profile: You → travel setup → update settings

Lifecycle acceptance added in this revision:

- Build a Plan → it appears in Plans immediately, with no "Make primary" and no "Watch".
- Build a Plan → the existing monitoring lifecycle starts automatically, with no
  notification permission implied.
- Reopen the app with a current Plan → Home shows that Plan, not the blank builder.
- Tap "Plan another trip" → the builder becomes available.
- `/plans` → the library, and the Plans tab is selected only there.
- Open a Plan from the library → the experience is current-Plan-centric and the Home tab
  is selected.
- No Plan disappears from anywhere simply because no explicit primary/watch action was
  taken.

Test at iPhone viewport before desktop; run typecheck and tests.

