# Standbye mobile UX audit — Aug 31 2026

Audit of the shipped V2 app against (a) native mobile app expectations, (b) what the backend can
actually deliver, and (c) how non-rev / standby travelers actually behave. Read-only: no code was
changed.

Method: full route + component read with file:line evidence, a Playwright pass at 393×852 (iPhone
sized) through Home → Plans → Plan Detail → Updates → You → Escape, a backend capability audit of
the plan/option/ranking/watch stack, and community research across r/flightattendants, nonrev.net,
Airline Pilot Central, FlyerTalk, plus the competitive set (StaffTraveler, ID90, myIDTravel,
FlyStandby, Vyntara, Passrider).

---

## 1. The core problem

The app is currently a **decision-support website with a tab bar bolted on**, aimed at a planning
mindset. The audience's actual moment of need is the opposite: one-handed, at a gate, stressed,
answering one question — *"am I getting on this flight, and if not, what's my next move?"*

Three structural consequences fall out of that mismatch, and everything below is downstream of them:

1. **Navigation has no stack.** One flat history, a 3-tab bar where "Home" is a catch-all for six
   route prefixes, and hand-rolled back links that disagree with the device back gesture.
2. **The app answers a question this audience did not ask.** It leads with judgment words
   ("Favorable", "Plan looks workable") and hides the numbers they actually trust
   (seats vs. standbys, list position, freshness).
3. **The backend already computes far more than the UI shows,** while the UI makes users wait on
   sequential round trips for the little it does show.

---

## 2. Navigation and screen architecture

### 2.1 The tab bar actively loses the user's place

`MainNav.tsx:16-26` — the Home tab matches `/plan`, `/known-flight`, `/plans/*`, `/options/*`,
`/updates/*`, `/watching/*`, `/escape*`.

- Tapping the already-active Home tab from `/options/$id/context/weather` hard-navigates to `/plan`
  (`MainNav.tsx:53`) and **discards the drill-down**. Native tab bars pop to that tab's root or
  no-op; they never teleport you out of your context.
- Opening a plan from the Plans library flips the highlight from Plans to Home
  (`MainNav.tsx:20,31,50`). Spec'd behavior, but it reads as a bug to every user who tapped a plan
  from the Plans list.
- No per-tab stack exists — `_authenticated/route.tsx:16-26` renders one `<Outlet/>`. Deep-linking
  into `/updates/$watchId` and tapping any tab destroys the context permanently. Any in-progress
  builder form state in `plan.index.tsx:162-398` unmounts on tab switch.

### 2.2 Two back buttons that disagree

Every screen hand-rolls a `<Link>` back instead of `router.history.back()`:
`plans.$planId.index.tsx:38-40` (hardcoded to `/plan`, labeled "Home"),
`plans.$planId.compare.tsx:140-146`, `plans.$planId.ways.tsx:46-52`,
`escape.$planId.index.tsx:73-79`, `escape.$planId.via.$hub.tsx:47-53`,
`updates.$watchId.tsx:132-144`, and `DetailScreen.tsx:34-38` ("Done" always forces
`/options/$optionId`).

So: open a plan from the Plans library → the on-screen arrow says "Home", the iOS swipe-back gesture
says "Plans". Two back mechanisms, two destinations. This is the most concretely testable navigation
bug in the app.

### 2.3 Sheets that are secretly full pages

The five option-evidence routes (`availability`, `context/history`, `context/weather`,
`context/holiday`, `recovery`) are styled as bottom sheets (`DetailScreen.tsx:24-27`, grabber handle,
`min-h-dvh`) but are full route pushes with their own page `<head>` metadata
(`options.$optionId.availability.tsx:14-27`). They get full-page transitions, URL-bar behavior and
scroll resets instead of a sheet slide-up — page vertigo three levels deep from Home.

### 2.4 Screen bloat: 24 authenticated routes for roughly 8 real jobs

| Duplication | Evidence |
|---|---|
| The current flight card is rendered **three times** on one screen path | `PlanSnapshot.tsx:97-138` (Home), `PlanView.tsx:187-230` (`TripBriefCard`), then again via `StandbyOptionRow` in `PlanDetailSections.tsx:84-90` |
| Compare restates Option Detail's pillar data | `plans.$planId.compare.tsx:51-98` vs `options.$optionId.index.tsx:190-249` |
| "Every way there" and "Find another way" show the same inventory, twice, differently | `plans.$planId.ways.tsx:40-42` vs `escape.$planId.index.tsx:62-66` |
| Five evidence routes each restate one pillar's label in more words | `context/weather.tsx`, `context/holiday.tsx` etc. |
| Two routes, one component | `options.$optionId.load.tsx:44-57` and `plans.$planId.loads.tsx:27-39` both render `LoadTask` |
| Four URLs for one concept | `/updates`, `/updates/$watchId`, `/watching`, `/watching/$watchId` (last two are pure redirect shims) |

**Orphans:** `/updates` has no link from anywhere in the nav or from `PlanView`/`PlanSnapshot` —
a fully built 185-line screen nobody can tap to. `/known-flight` is reachable only from one buried
text link (`plan.index.tsx:391-396`). `/how-it-works` is reachable only from `you.tsx:86`.

### 2.5 Mobile ergonomics defects

- **Bottom-nav overlap.** `Screen` reserves the correct clearance (`Layout.tsx:24`), but eight
  routes render a raw `<main>` with a fixed `pb-14`/`pb-16` and no safe-area term:
  `plans.$planId.compare.tsx:139`, `plans.$planId.ways.tsx:45`, `escape.index.tsx:93`,
  `escape.$planId.index.tsx:72`, `escape.$planId.via.$hub.tsx:46`, `updates.$watchId.tsx:130`,
  `known-flight.tsx:67`, `how-it-works.tsx:74`. The three ad hoc error screens
  (`options.$optionId.index.tsx:70-95`, `options.$optionId.load.tsx:32-39`) have **no bottom padding
  at all**. Last-row buttons can sit behind the tab bar on home-indicator devices.
- **`min-h-screen` on the authenticated shell** (`route.tsx:18`) while sheets use `min-h-dvh`
  (`DetailScreen.tsx:25`) — inconsistent bottom-edge behavior as the iOS toolbar collapses.
- **Undersized targets:** the `•••` menu at `updates.$watchId.tsx:146-153` (~32px) and the compare
  pickers at `plans.$planId.compare.tsx:281-291` (`h-10` = 40px), both under 44px.
- **No sticky primary CTA anywhere.** `sticky` appears exactly once in the codebase, on the desktop
  sidebar (`MainNav.tsx:70`). On Compare, Ways and Escape Results the "Use this option" action sits
  in normal document flow below several sections.
- **Type ladder is ad hoc:** headings hardcoded as `text-[28px]`, `text-[30px]`, `text-2xl` across
  `plans.index.tsx:73`, `plan.index.tsx:225`, `plans.$planId.compare.tsx:148`; body copy alternates
  `text-[15px]` / `text-sm` / `text-[14px]` / `text-[13px]` for identical purposes. `SectionHeading`
  exists in `Layout.tsx:34-78` but several routes hand-roll their own eyebrow instead
  (`plans.$planId.ways.tsx:103-109`, `options.$optionId.index.tsx:186-254`).
- **Compare grid has no `overflow-x-auto` guard** (`plans.$planId.compare.tsx:184`).

### 2.6 Failure states are the biggest reliability gap

**No route reads React Query's `isError` for its primary read except `/options/$optionId`.** If
`getPlan`, `getStandbyProfile` or `getWatchTimeline` throws — the single most common failure mode on
airport LTE — `/plans/$planId`, `/plans`, `/plan`, `/updates`, `/you` all render an indefinitely
blank page below the header with no retry. The five evidence routes never even destructure
`isLoading`, so they flash blank. There is no shared skeleton component; every loading state is
one-off plain text, so content reflows on arrival.

---

## 3. What the backend already has that the UI never shows

- `commercialFare` and `standbyClears` are computed and persisted (`plan.server.ts:274-275,339-344`)
  and referenced by **zero components**. "What would this cost to buy" and clear-history are two of
  the most-wanted numbers in the community.
- `PlanStrategy.connection` inbound/onward shot counts per gateway (`plan-strategy.ts:11-38`) exist
  for every discovered path but only surface in `ways`/`escape`, never on Home or Plan Detail.
- `ChangeItem.kind` and `.severity` are computed and stored
  (`plan-watch-events.server.ts:158-374`) but `updates.$watchId.tsx:280-294` renders every event with
  identical visual weight — meaningful and context changes look the same.
- `next_check_at` is scheduled server-side (`plan.server.ts:1542`) and never exposed, so the UI can
  say "checked 26h ago" but never "next check in 20 min" — the reassurance half of the trust signal.

## 4. Performance: waterfalls the user will feel

- **Home is a double round trip.** `plan.index.tsx:81-127` calls `getCurrentPlanForHome` (which
  itself runs `loadPlanSummaries` + `resolveAndPersistPlanLifecycle` → another `loadPlan` and
  possible writes, `plan-lifecycle.server.ts:343-372`), then `CurrentPlanHome` fires a **second**
  dependent `getPlan`. Observed live: Home showed "Loading your standby day…" past a 3.5s wait.
- **`getWatchTimeline` runs ~5 DB round trips to render one timeline** — `loadWatchTimeline`
  (`plan.server.ts:1657-1663`) calls the full `loadWatches` (3 queries) just to find one watch by id.
- **Zero route loaders.** `rg "loader:" src/routes` returns nothing. Every navigation pays a fresh
  client→server round trip after JS mounts, with no prefetch on link hover/press.
- **`buildPlan` blocks synchronously** on the entire multi-provider fan-out (GF8 board, METAR/TAF,
  history, connection discovery) before returning a `planId` (`plan.server.ts:348-444`).
- **No push, no service worker, no offline cache, no `refetchInterval`.** `notifyMode`/`notifyOptin`
  are collected (`plan.functions.ts:18,23`) and consumed by nothing. Cancellations are detected
  server-side by the cron (`api/public/run-watches.ts`, 25 watches/tick) and the traveler only learns
  about them if they happen to reopen the app. For a travel-day product this is the single largest
  gap in the system.

---

## 5. What standby travelers actually need (research)

Consistent findings across nonrev.net, r/flightattendants, APC and FlyerTalk:

- **The seat count is not the list.** The most-repeated hard-won lesson: *"You can see 20 open seats
  and still not clear because there's 25 standbys ahead of you with better priority. Seats vs.
  standbys is the only number that matters."* A tool that shows availability without a priority
  reading is judged naive.
- **Load accuracy is the entire product.** ID90 removed "Check Loads", got 800+ pieces of user
  feedback, and reinstated it. StaffTraveler's 4.9★ reviews praise accuracy, never features.
- **Data conflicting with the airline's own app is the fastest trust-killer** (the recurring
  ID90-vs-Alaska seat-map threads). Users cross-check, always.
- **Vocabulary is fixed and specific:** loads, load check, listed, cleared, rolled/bumped,
  seniority, S1/S2, PALL, jumpseat, ZED, buddy pass, oversold, cabin rollover.
- **The emotional arc** is: night-before obsessive load checks → morning re-check and confirm listing
  → airport, arrive early, hold bags → **gate, peak anxiety, watching for your name** → cleared
  (relief) or rolled (immediate scramble to Plan B and a hotel-vs-terminal decision).
- **What reads as gimmicky:** AI-flavored routing without ground truth, gamification, social feeds,
  and any number presented without explaining where it came from.
- **Provenance matters** — "built by crew, for crew" is a real purchase driver, because outsiders
  routinely get the rules wrong.

### Where Standbye currently sits against that

| They want | Standbye shows today |
|---|---|
| Seats vs. standbys ahead of me | A public booking-availability probe capped at 4, explained defensively ("It does not mean four seats are open") |
| List position / priority | Nothing |
| Freshness in minutes | "checked 26h 16m ago" while simultaneously claiming "Standbye is watching the day" |
| Next flight if I'm rolled | Present, but buried behind "BACKUP OPTIONS" three scrolls down |
| Plain numbers | Judgment words first: "FAVORABLE", "Plan looks workable", 😐 "Mixed" |

The 26-hour-stale "watching" line observed on Home is, by this audience's own standards, the exact
thing that makes them delete an app.

---

## 6. Recommended changes, in priority order

### P0 — Trust and truth (do first; cheap, and everything else depends on it)

1. **Never claim to be watching while stale.** If `lastCheckedAt` is older than the check interval,
   say so and offer one tap to refresh. Expose `next_check_at` so the line reads
   "Checked 4 min ago · next check ~26 min".
2. **Fix the Home flight card's ambiguity.** Observed: `ORD ——— 3:05 PM LAX` above
   `Departs 12:40 PM`. Two times, no labels, one of them unlabeled. Label departs/arrives everywhere.
3. **Add error states with retry** to every primary read. One shared `<QueryState>` /
   `<ScreenSkeleton>` pair covering loading, empty, error, used by all 24 routes.
4. **Lead with numbers, then the judgment.** Booking-check depth, backup count, and last-checked
   belong above the smiley chip, not below it. Keep the judgment as a supporting chip.

### P1 — Make it navigate like an app

5. **Replace all hand-rolled back links with history-aware back** (`router.history.back()` with a
   route-appropriate fallback). One `<BackBar>` component. Removes the two-back-buttons bug.
6. **Convert the five evidence routes and Compare into real overlays** — Radix `Drawer`/`Sheet` over
   the option, driven by a search param rather than a route push. Cuts six full page navigations.
7. **Fix the tab bar.** Either give each tab its own stack (Home / Plans / You each with an
   `<Outlet/>` and preserved state) or — simpler and probably right — reduce the tab bar to
   **Today · Plans · You** where "Today" is the live travel-day screen and drill-downs push over the
   whole tab bar rather than sitting inside it, so the tab bar isn't lying about where you are.
8. **Add a sticky bottom action bar** for the primary commit on Compare, Ways, Escape and Option
   Detail. Never make the one decision the screen exists for require a scroll.
9. **Fix safe-area padding** on the eight raw-`<main>` routes and the three error screens; switch
   `route.tsx:18` to `min-h-dvh`; raise the two sub-44px targets.

### P2 — Collapse the screen count

10. **Merge Ways and Escape into one "Other ways" surface** with a normal/widened toggle. They show
    the same inventory today.
11. **Compare becomes a sheet launched from the options list**, not a route.
12. **One evidence sheet parameterized by pillar key**, replacing five near-identical routes.
13. **Delete `/watching` and `/watching/$watchId` shims**; either link `/updates` from Home and Plan
    Detail or delete that screen too — it is currently unreachable by tapping.
14. **Remove the triplicated flight card.** One `<FlightIdentityCard>` shared by Home snapshot and
    Plan Detail header, and drop the third render in `PlanDetailSections.tsx:84-90`.

### P3 — Close the gap to what this audience actually uses

15. **Surface `commercialFare` and `standbyClears`** — already computed, currently invisible.
16. **Make load entry the hero, not a task row.** Loads are the product for this audience; the
    screenshot parser is the strongest differentiator in the app and it currently sits below the
    fold under "YOUR PLAN".
17. **Add "standbys ahead of me"** as a first-class field (user-entered if not derivable), and rank
    against it. Without it, the community's own test — "seats vs. standbys" — is unanswered.
18. **Ship push notifications** (web push + PWA install prompt). Detected changes that never reach
    the traveler are worth nothing, and this is the one thing a browser-based competitor set does
    badly.
19. **Add route loaders / prefetch** and split `buildPlan` into an immediate `planId` plus a
    streamed/polled ranking, so "Build my plan" and Home stop blocking on a multi-provider fan-out.
20. **Adopt their vocabulary**: cleared, rolled, listed, loads, S1/S2. "Plan looks workable" and
    "realistic ways remain" are our words, not theirs.

### The one screen, if you only fix one thing

A travel-day "Gate" screen: flight + status banner → seats vs. standbys ahead (with source and
timestamp) → your read (likely / tight / unlikely, in words, with the reason) → next viable flight
one tap away → one contextual action button. Everything else — trip logging, route discovery,
weather, education — lives elsewhere.
