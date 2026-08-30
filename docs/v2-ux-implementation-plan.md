# Standbye V2 UX — repo audit and implementation plan

Companion to `docs/v2-ux-architecture-spec.md`. Written 2026-08-30 from a read-only
audit of the repo. No code has been changed.

## 1. Route audit (current state)

| Route | File (lines) | Current state vs V2 spec |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` (91) | Already close. Wordmark, one promise, Get started, Sign in. Minor copy alignment only. |
| `/onboarding` | `src/routes/onboarding.tsx` (486) | Single file, ~17 steps in one `step` state machine with teaching screens from `components/aircue/onboarding/TeachingScreens.tsx`. Needs reduction to 5 required steps; teaching screens must be retained for contextual reuse. |
| `/auth` | `src/routes/auth.tsx` (199) | Matches the spec. No work. |
| `/welcome` | `_authenticated/welcome.tsx` (112) | Longer than the 3-line transition the spec wants. |
| `/plan` (Home) | `_authenticated/plan.index.tsx` (346) | Carries cabin, carrierMode, routingMode, nearby, Widen entry and recent searches inline. All of these must move behind a "Trip options" sheet or into the profile. |
| `/known-flight` | (161) | Already focused; CTA/copy alignment only. |
| `/plans/$planId` | (242) + `PlanDetailSections.tsx` | Correct pieces, wrong hierarchy. Exposes "Your primary option", "Make this my primary", "Standbye currently prefers…", watch controls as their own block, loads/Widen/ways/compare as peer CTAs. |
| `/options/$optionId` | (329) | Good content, branches to five evidence routes as full pages. |
| `/options/$optionId/{availability,recovery,context/*}` | 52–129 each | Become sheets/pushed panels; URLs preserved. |
| `/options/$optionId/load` | (255) | Duplicate load UX vs the plan-level one. Must share the task UI. |
| `/plans/$planId/loads` | (495) | Largest screen in the app. Screenshot + manual in one page; needs the method-picker split and the payoff screen. |
| `/plans/$planId/compare` | (267) | Horizontal table. Needs 2-up mobile layout + verdict line. |
| `/plans/$planId/ways` | (179) | Right content, rename to "Every way there", tighten connection summaries. |
| `/escape`, `/escape/$planId`, `/escape/$planId/via/$hub` | 182 / 280 / 133 | Escape entry re-asks origin+destination+date. Must accept plan context and ask at most "where are you now / when". |
| `/updates` | (185) | Duplicates plan state as its own inbox. Leaves nav; keep route as legacy redirect. |
| `/updates/$watchId` | (304) | Already timeline-shaped. Becomes "Activity" reached from a Plan. |
| `/watching`, `/watching/$watchId` | 7 each | Already redirects. No work. |
| `/you` | (150) | Contains a duplicate plans list (`listCommittedPlans`) that must be removed; needs the four-section settings layout. |
| `/how-it-works` | (129) | Keep; becomes the destination for education moved out of onboarding. |
| Nav | `components/aircue/MainNav.tsx` | Four items (Home/Plans/Updates/You). Reduce to three. |

## 2. Lifecycle decisions resolved in revision 2

### 2.1 Home has two states

`/plan` is not a builder route; it is the current-Plan route that falls back to a
builder. Implementation: `plan.index.tsx` queries `listPlans()`, picks the current Plan
(travel date today or later, soonest first, ties by most recently updated). If one
exists, Home renders the Plan-first layout (spec §5A) by reusing the same section
components as Plan Detail; otherwise it renders the builder (spec §5B). "Plan another
trip" flips to the builder via local state (and may set a `?new=1` search param so the
choice survives a refresh) — it does not navigate to a second route.

### 2.2 The committed distinction is removed from behavior

`listCommittedPlans()` and `listRecentSearches()` stop being called by the UI. `/plans`
and Home both read `listPlans()` and derive ACTIVE / UPCOMING / PAST client-side from
travel date and existing plan state. The three server functions stay in
`plan.functions.ts` untouched — this is a consumption change, not a data change. No
migration, no ranking change. Recent searches disappear as a concept because every Plan
is already in Plans.

### 2.3 Monitoring starts automatically

Because the Watch CTA is removed, a newly built Plan must enter the existing monitoring
lifecycle on its own, using the existing infrastructure (`startWatchPlan` →
`beginWatch`, plan-scoped). Monitoring is a property of a current Plan, never a mode the
user manages.

Monitoring ≠ notification. Notification opt-in remains an explicit setting under
You → Notifications; automatic monitoring must not enable any delivery channel.

**Flagged, smallest change, confirm before coding:** call the existing plan-scoped
monitoring start exactly once at Plan creation with a non-notifying mode instead of
behind a user tap. Open question to answer first: do the existing `mode` values already
express "monitor without notifying"? If not, stop and review — do not invent a mode, and
do not touch watch cadence, economics or event semantics.

### 2.4 Navigation ownership

`MainNav` keeps three items and changes only its matchers:

- Home is active for `/plan`, `/known-flight`, `/plans/$planId` **and all descendants**
  (`/loads`, `/compare`, `/ways`), `/options/*`, `/updates/$watchId`, `/escape*`.
- Plans is active only for an exact `/plans` match.
- You is active for `/you*` and `/how-it-works`.

Concretely: Plans uses `path === "/plans"`; Home's matcher adds
`path.startsWith("/plans/")` plus the options/updates/escape prefixes. No route files
move, no URLs change, no redirects are added.

### 2.5 Contextual education persists without a migration

First-use teaching reuses an existing profile flag where one already fits; otherwise it
uses local persistence alongside the existing onboarding draft in
`lib/aircue/onboarding.ts`. Any proposal to persist education state server-side is
flagged for review before coding.

## 3. What is presentation-only vs what touches server code

Presentation-only (the vast majority of this work):
- Navigation matchers, screen composition, section ordering, copy changes.
- Turning evidence routes into sheets (route files keep their loaders; a sheet host
  renders the same content component).
- Switching Home and Plans from `listCommittedPlans`/`listRecentSearches` to `listPlans`.
- Onboarding step reduction — the draft shape in `lib/aircue/onboarding.ts` already holds
  each field; skipped steps simply leave existing defaults.
- Loads task split, compare layout, ways/escape copy.

Flags — anything here stops and asks before implementation:
- **Automatic monitoring on Plan creation** (§2.3). The only behavioral change in the
  whole pass.
- **Preferred vs primary option.** The UI stops exposing both, but the Plan payload
  (`plan.primaryOptionId`, `plan.preferredOptionId`, `plan.noStrongSetup`) stays exactly
  as-is. "Use this option" calls the same set-primary mutation. No ranking change.
- **Plans ACTIVE / UPCOMING / PAST grouping.** Derived client-side from travel date and
  existing plan state; PAST = travel date in the past. No migration in this pass.
- **Escape launched from a Plan.** Requires passing plan context (destination, date,
  travelers) through search params; if the escape server fn cannot accept a plan id,
  the entry screen keeps prefilled-but-hidden values rather than changing the server fn.
- **"Checked N minutes ago" and Activity timeline entries** must come from existing watch
  event data. No new event types.
- **Any new persistent flag for first-use education.** Default is no migration.
- Ranking, scoring, travel eligibility, providers, gateway/recovery logic: untouched.

## 4. Execution in four controlled passes

Each pass ends with a working app, typecheck + tests green, and an iPhone-viewport walk
of the screens it touched.

### Pass 1 — Navigation, shell and the Plan spine
Scope: `MainNav` three items **and the ownership matchers in §2.4**, `/updates` out of
nav and left as a legacy route, `/plans/$planId` hierarchy rebuild (route →
date/travelers → plan state → YOUR CURRENT PLAN → monitoring line → backup options →
plan actions → every route → activity link), "Your current plan" / "Use this option"
language, the changed-plan block at the top of the Plan, and the Plans library reading
`listPlans()` with ACTIVE / UPCOMING / PAST and system vocabulary removed.
Why first: it establishes the mental model everything else hangs off, and it is the
screen the user sees most.
Stories covered: normal plan, change, history, `/plans` library, no-Plan-disappears.

### Pass 2 — Home states, entry and onboarding
Scope: Home's two states (§2.1) with the Plan-first layout reusing Pass 1's sections and
"Plan another trip" revealing the builder; builder stripped to from / to / when /
travelers + "Build my plan" + "Have a flight number?"; advanced controls into a "Trip
options" sheet; recent searches removed; the automatic-monitoring lifecycle change from
§2.3 **once confirmed**; building-state transitional UI; `/known-flight` copy;
`/welcome` shortened; `/` copy alignment; onboarding reduced to five required steps with
the teaching screens preserved and re-mounted as contextual first-use education using
non-migrating persistence (§2.5).
Stories covered: first user, returning user, plan another trip, automatic monitoring.

### Pass 3 — Option detail, evidence sheets and loads
Scope: flatten `/options/$optionId` into header → "Why this ranks here" rows → reported
load → more context → single "Use this option" action; convert the five evidence routes
to sheets/pushed panels while keeping their URLs; rebuild `/plans/$planId/loads` as a
task (method picker → screenshot or manual → payoff "Plan updated · UA 1847 moved from
#3 to #1"); make `/options/$optionId/load` reuse that exact UI.
Stories covered: normal plan inspect, load.

### Pass 4 — Widen, ways, compare, activity and profile
Scope: `/escape` as an action of a Plan (no re-asking destination/date/travelers),
`/escape/$planId` as "Another way to LAX" with BEST WAY FORWARD, `/escape/$planId/via/$hub`
drill-down, `/plans/$planId/ways` as "Every way there", `/plans/$planId/compare` as a
2-up mobile comparison with a verdict line, `/updates/$watchId` presented as Activity,
`/you` with the duplicate plans list removed and the four settings sections in place,
`/how-it-works` absorbing the education moved out of onboarding.
Stories covered: recovery, change → activity, profile.

## 5. Definition of done for the whole pass

- Bottom navigation has three destinations, with the ownership matchers from §2.4.
- No user-facing string contains: primary option, preferred option, watch ID, committed,
  escape, availability, gateway, or recent searches.
- "Watching" never appears as a product section, as a mode the user must manage, or as
  internal-state vocabulary shown to the user. Natural copy such as "Standbye is watching
  the day" is allowed and expected.
- Every screen answers where am I / what is happening / what should I do next in under
  two seconds at 390×844.
- All spec acceptance stories pass manually, including the lifecycle set:

  1. Build a Plan → it appears in Plans immediately, with no "Make primary" or "Watch".
  2. Build a Plan → the existing monitoring lifecycle starts automatically.
  3. Reopen the app with a current Plan → Home shows the Plan, not the blank builder.
  4. Tap "Plan another trip" → the builder becomes available.
  5. `/plans` → the library; Plans tab selected only there.
  6. Open a Plan from the library → the experience stays current-Plan-centric, Home tab
     selected.
  7. No Plan disappears because no explicit primary/watch action was taken.

- No diff in ranking, scoring, eligibility, provider or gateway/recovery modules, and no
  database migration.

