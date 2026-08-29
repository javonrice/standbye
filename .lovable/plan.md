# Standbye — plan-oriented pivot

Make the Plan the thing the traveler owns. A flight becomes an Option inside a Plan.
Standbye watches the Plan and raises Updates when the decision should change.
Nothing in the ranking, Escape, evidence, or cancellation-detection work is rebuilt.

## Phase 1 — Plan becomes the owned object

Today a watch row is anchored to `plan_option_id`, and rechecking only re-scores that
one option. The plan's original search context (cabin, carriers, stops, nearby,
routing mode) is stored on the plan but not replayed on recheck.

- Add plan-level state: primary option, plan status (steady / tradeoffs / worth another
  look / changed), last checked, watching flag, backup-runway counts, mode
  (standard or widened).
- A watch becomes unique per plan. Old rows keep working: their option is read as the
  plan's primary anchor, so the shipped cancellation detection keeps firing unchanged.
- Recheck replays the plan's own search context — origin, destination, date, travelers,
  cabin, carriers, max stops, nearby, routing mode — reranks the whole plan, and then
  separately checks what happened to the primary option.

## Phase 2 — Plan Detail is the center

`/plans/$planId` becomes the most important screen.

- Header: route, date, travelers, then a plan-level status line ("Plan looks workable" /
  "Plan has tradeoffs" / "Worth another look").
- Current move: "Best move right now" with **Make this my primary**, or "Your primary
  option" shown first even when it is no longer rank 1, with "Standbye now prefers
  UA1107" underneath. The primary never changes on its own.
- Backup runway: "4 realistic ways remain — 2 nonstops · 2 connections", counted from
  the options already ranked for the plan (no extra provider calls).
- Other good options, then "All ways there" and "Compare options" as sub-screens.
- Watching lives here: "Let Standbye watch this plan" / "Standbye is watching this plan ·
  last checked 12m ago", with view updates, recheck now, stop watching.
- Option Detail keeps all its evidence but loses the watch action; it gets
  **Make this my primary option** and a link back to the Plan.

## Phase 3 — Navigation and Updates

- Tabs become **Plans · Updates · You**.
- Plans Home: active plans first (route, date, travelers, plan status, primary option,
  backup runway, watching state), then **+ New plan**, then recent plans. With no plans
  it opens straight on the create form under "Where are you trying to go?".
  CTA becomes **Build my plan**. Known flight becomes "Already have a flight in mind?
  Start with it".
- Updates replaces Watching: "All quiet — 3 plans are being watched" or "2 plans need
  another look", with events grouped by plan, and the watched-plan list underneath.
- The per-plan timeline stays but speaks in plan terms, never implying Standbye switched
  the traveler's flight.
- Plan Changed takeover always names the plan, the reason, and what remains.
- Known flight resolves the leg, creates a normal Plan with that flight as the initial
  primary, searches alternatives around it, and lands on Plan Detail.

## Phase 4 — Escape becomes "widen this plan"

- From a Plan: **Need another way? Widen this plan** — prefilled with the same objective
  and traveler context, running the existing wide-routing engine, staying on the same
  plan.
- The standalone "I'm stuck — get me there" entry stays, but it now creates a normal Plan
  in widened mode and lands on Plan Detail.
- `/escape/$planId` keeps working, relabelled as a widened view of the same plan and
  linking back to that exact plan. It is retired later, once Plan Detail has parity.
- Wide results feed the backup runway count.

## Phase 5 — Meaningful plan changes

On top of the shipped cancellation event, add deterministic detectors:

1. A different option becomes materially better.
2. Backup runway shrinks to one or zero realistic ways.
3. Earlier-cancellation spillover pressure on the route.
4. Major operational deterioration affecting the plan.
5. A strong new alternative appears.

Score noise, rank 3/4 swaps, routine weather movement and stale caches stay silent.
Provider failure is never shown as a travel event. Takeover is reserved for changes that
actually alter the decision.

## Copy pivots

Welcome CTA becomes "Build my first plan". Onboarding keeps every existing step and only
shifts examples toward "tell Standbye where you're trying to get". You and How Standbye
Works are rewritten around objective → options → the day around them → backup runway →
watching, keeping "Standbye does not know whether you will clear".

## Not in this pass

Arrival deadline, plan sharing, shortlists, and push delivery.

## Technical notes

- One additive migration: `plans` gains `primary_option_id`, `status`, `mode`,
  `backup_runway` (jsonb), `watching`, `last_checked_at`; `watch_plans.plan_option_id`
  becomes nullable with a unique active watch per `plan_id`. No drops or renames.
- `plan.server.ts`: `recheckWatch` reranks the plan from its stored search context,
  then evaluates the primary option; `beginWatch` keys on `plan_id`.
  `snapshotOf` grows plan-level fields so dedup keeps working on existing rows.
- Backup runway is derived in `ranking.server.ts` from the ranked option set.
- Routes: `/plan` → Plans Home, `/watching` → `/updates` (old paths redirect),
  `/plans/$planId` gains primary/watch/runway sections, watch CTA removed from
  `options.$optionId.index.tsx`.
- Edge cases covered by the model: no primary, single option, no viable options,
  multi-leg numbers, load changes that flip the preference, carrier-access changes after
  creation, several plans on one date, day-over plans, and pre-migration watch rows.
