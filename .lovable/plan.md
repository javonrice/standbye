# You → the Standbye Passport

Turn You from a settings list into the traveler's personal passport: globe first, identity, then the record of standbys they actually made. Administrative settings move behind a gear.

## The missing piece: trip outcomes

Nothing today records whether a standby attempt succeeded. Plans have a route, a date and options, but no "did you make it" result. A passport built on plans alone would count trips the traveler never boarded.

So this build adds outcome capture first:

- After a plan's travel date passes, Home and Plans show a single quiet prompt: "Did you make it on?" with **Made it** / **Didn't make it** / **Plans changed**.
- Only **Made it** trips count toward the passport globe, stats and achievements.
- Unanswered past plans stay out of the passport and keep showing the prompt in Plans until answered or dismissed.

## The shared globe

The Home globe becomes a reusable `StandbyeGlobe` component. One implementation, two modes:

- **Route mode** (Home): today's plan path, origin → hub → destination.
- **History mode** (You): home airport as the anchor, a glowing dot at every airport successfully reached, faint arcs for each successful trip, drag to rotate, pinch to zoom, and tap a marker for a small detail card ("LAX · 3 successful standbys · Last visited Aug 18").

Home keeps its current look; nothing about it changes visually.

## You screen structure

1. **Header** — Standbye mark, display name when set, settings gear on the right.
2. **History globe** — interactive, fills the top of the screen.
3. **Core stats** — standbys this year, all-time, destinations reached, airports visited, airlines flown.
4. **Year view** — "2026" with the destinations reached that year.
5. **Recent standbys** — ORD → LAX, ORD → DEN … each opens a completed-trip recap (route, airline and flight, date, seats at the time, what Standbye judged before departure).
6. **Achievements** — factual only: first standby, 10 successful standbys, 5 destinations, new airport, coast to coast. No XP, points or streaks.
7. **Share my Standbye Passport** — a generated card with the traveler's stats and successful-route globe. Never includes employee load data.

## Settings behind the gear

Traveler type, home airline, home airport, travel access, notifications, Edit access, How Standbye works, Sign out — all move to a `/you/settings` screen. Nothing is removed.

## Technical notes

- New `plan_outcomes` table (user_id, plan_id, outcome, flown_option_id, carrier, recorded_at) with owner-scoped RLS and grants for `authenticated` / `service_role`; a unique index on plan_id.
- New server functions in `plan.functions.ts`: `recordPlanOutcome`, `pendingOutcomePlans`, and `getPassport` (stats, per-year destinations, recent trips, visited-airport aggregates joined to `airports` for lat/lon).
- `GlobeCanvas.tsx` gains a `mode` prop plus marker click handling; `RouteGlobe.tsx` becomes `StandbyeGlobe.tsx` with `route` and `history` variants. No second three.js implementation.
- Routes: `/you` rewritten, new `/you/settings`, new `/you/trips/$planId` recap, new `/you/passport` share card. `MainNav` already matches `/you/*`.
- Share card is rendered in-app as a capture-friendly panel with the Web Share API where available; load figures are excluded by construction.

## Sequence

1. Outcome table + prompt + server functions (passport has real data).
2. Shared `StandbyeGlobe` refactor with history mode.
3. You rewrite: globe, stats, year view, recent, achievements.
4. Settings screen behind the gear + completed-trip recap.
5. Share card.
