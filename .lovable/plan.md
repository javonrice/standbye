# Standbye V2 UX — audit saved, four-pass plan ready

No code changed. Two reference documents are now in the repo:

- `docs/v2-ux-architecture-spec.md` — the full V2 screen-by-screen spec, mockups,
  route map, Flighty interaction models and acceptance stories.
- `docs/v2-ux-implementation-plan.md` — the repo audit, route-by-route mapping, the
  list of things that would touch server logic, and the four-pass sequence.

## What the audit found

Every capability the spec asks for already exists. The problem is hierarchy and
vocabulary, not missing functionality.

- Navigation has four destinations; Updates is a product object it shouldn't be.
- Home (`/plan`, 346 lines) carries cabin, carrier, routing mode, nearby airports,
  Widen and recent searches inline.
- Plan Detail exposes "Your primary option", "Make this my primary" and watch controls
  as a peer block; loads, Widen, ways and compare all compete as equal CTAs.
- Option Detail branches into five full-page evidence routes.
- Loads is a single 495-line screen with no method picker and no payoff moment.
- `/you` renders a second plans list.
- Onboarding teaches booking checks, widening, loads and monitoring before the user has
  ever built a plan.

## Flagged — will confirm before touching

- Primary vs preferred option stays exactly as-is in the data; the UI just stops naming
  both, and "Use this option" calls the existing set-primary mutation.
- Plans ACTIVE/UPCOMING/PAST is derived client-side from travel date; no migration.
- Escape from a Plan passes context through search params rather than changing the
  server function.
- Ranking, scoring, eligibility, providers, gateway and recovery logic: untouched.

## The four passes

1. **Navigation, shell and the Plan spine** — three-item nav, `/updates` out of nav,
   Plan Detail hierarchy rebuild, changed-plan block at the top, Plans library sections.
2. **Entry, Home and onboarding** — Home stripped to from/to/when/travelers, advanced
   controls into a "Trip options" sheet, building state, shorter welcome, onboarding cut
   to five steps with the teaching screens reused contextually.
3. **Option detail, evidence sheets and loads** — flatten Option Detail, convert the five
   evidence routes to sheets while keeping their URLs, rebuild loads as a task with the
   "Plan updated · moved from #3 to #1" payoff, share it with the option-level load.
4. **Widen, ways, compare, activity and profile** — Escape as an action of a Plan, "Every
   way there", 2-up mobile compare with a verdict line, Activity, `/you` cleanup, and
   `/how-it-works` absorbing the moved education.

Each pass ends with a working app, typecheck and tests green, and an iPhone-viewport
walk of the screens it touched.
