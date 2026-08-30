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

## 2. What is presentation-only vs what touches server code

Presentation-only (the vast majority of this work):
- Navigation item removal, screen composition, section ordering, copy changes.
- Turning evidence routes into sheets (route files keep their loaders; a sheet host
  renders the same content component).
- Onboarding step reduction — the draft shape in `lib/aircue/onboarding.ts` already holds
  each field; skipped steps simply leave existing defaults.
- Loads task split, compare layout, ways/escape copy.

Flags — anything here stops and asks before implementation:
- **Preferred vs primary option.** The UI stops exposing both, but the Plan payload
  (`plan.primaryOptionId`, `plan.preferredOptionId`, `plan.noStrongSetup`) stays exactly
  as-is. "Use this option" calls the same set-primary mutation. No ranking change.
- **Plans ACTIVE / UPCOMING / PAST grouping.** Grouping must be derived client-side from
  travel date and existing plan state. If a "completed" concept does not exist in the
  data, PAST = travel date in the past. No migration in this pass.
- **Escape launched from a Plan.** Requires passing plan context (destination, date,
  travelers) through search params; if the escape server fn cannot accept a plan id,
  the entry screen keeps prefilled-but-hidden values rather than changing the server fn.
- **"Checked N minutes ago" and Activity timeline entries** must come from existing watch
  event data. No new event types.
- Ranking, scoring, travel eligibility, providers, gateway/recovery logic: untouched.

## 3. Execution in four controlled passes

Each pass ends with a working app, typecheck + tests green, and an iPhone-viewport walk
of the screens it touched.

### Pass 1 — Navigation, shell and the Plan spine
Scope: `MainNav` (three items), `/updates` out of nav and left as a legacy route,
`/plans/$planId` hierarchy rebuild (route → date/travelers → plan state → YOUR CURRENT
PLAN → monitoring line → backup options → plan actions → every route → activity link),
"Your current plan" / "Use this option" language, the changed-plan block at the top of
the Plan, and the Plans library sections (ACTIVE / UPCOMING / PAST) with system
vocabulary removed.
Why first: it establishes the mental model everything else hangs off, and it is the
screen the user sees most.
Stories covered: normal plan, change, returning user, history.

### Pass 2 — Entry, Home and onboarding
Scope: `/plan` stripped to from / to / when / travelers + "Build my plan" + "Have a
flight number?", advanced controls into a "Trip options" sheet, recent searches removed
from Home, building-state transitional UI, `/known-flight` copy, `/welcome` shortened,
`/` copy alignment, onboarding reduced to five required steps with the teaching screens
preserved and re-mounted as contextual first-use education.
Stories covered: first user, normal plan start.

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

## 4. Definition of done for the whole pass

- Bottom navigation has three destinations.
- No user-facing string contains: primary option, preferred option, watching, watch ID,
  committed, escape, availability, gateway.
- Every screen answers where am I / what is happening / what should I do next in under
  two seconds at 390×844.
- All eight acceptance stories in the spec pass manually.
- No diff in ranking, scoring, eligibility, provider or gateway/recovery modules.
