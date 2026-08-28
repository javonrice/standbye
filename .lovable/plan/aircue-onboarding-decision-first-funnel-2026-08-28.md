# AirCue onboarding — decision-first funnel

Rebuild onboarding as a pre-account, story-driven funnel that ends by dropping the user into a real plan search with a free Standby Day marked as available.

Today onboarding is a 3-step form that lives *behind* sign-in (`/_authenticated/onboarding`), and `/` is a short first-launch screen. The new flow inverts that: the user learns the product, answers a few one-tap questions, and only then creates an account.

## The funnel

1. **Promise** — logo, "Standby without all the constant checking", Get started / Sign in.
2. **What gets old?** — 4 one-tap pain options, saved and reused in later copy.
3. **We know the routine** — the portal → StaffTraveler → booking site → weather ritual, ending in "Which one should I try?" with an [Exactly] button.
4. **Traveler type** — employee / spouse / retiree / buddy / other (auto-advance).
5. **Home airline** — searchable list, popular carriers first, "I don't have one" escape.
6. **Travel access** — home airline / partner-ZED / only airlines I select (opens a chip selector).
7. **Home airport** — one short question so later examples and the Plan screen can prefill origin.
8. **Example: recovery** — two mock flights; earlier one wins because later shots remain.
9. **Example: routing** — nonstop degrades, ORD→DEN→LAX becomes the better move.
10. **Example: no load** — reported load "—", other signals green, confidence Medium.
11. **Example: add a load** — reported load raises confidence to High.
12. **Trust** — "we won't make up your odds", 72% struck through.
13. **Personalization loading** — animated percent + checklist, running while the profile actually saves.
14. **Reveal** — their airline, traveler type, access, connections, built from their answers.
15. **Create account** — Google or email; no skip.
16. **Free Standby Day** — gift reveal, no pricing, [Use my free day].
17. **Land in Plan** — with a "Your free Standby Day · Ready to use" banner and origin prefilled.

Screens 08–11 use the user's own home airport as the origin in the example copy (mock data underneath, no API calls).

Contextual, after onboarding:
- **Notification priming** after their first Watch — [Keep me updated] saves a notify preference on the profile; no browser permission prompt yet, since delivery isn't built.
- **Add-a-load coach** shown once, the first time they open an option with no reported load.

## How answers survive the pre-account phase

Screens 2–12 run signed-out, so answers are held in React state and mirrored to `sessionStorage`. Right after account creation on screen 15, the collected profile is written to the backend in one call, and the temporary copy is cleared. If the user signs in with an existing onboarded profile, the funnel is skipped and they go straight to Plan.

## Technical notes

- New public route tree `src/routes/onboarding.*` (a layout holding the shared back-arrow + progress chrome, one file per step group). Delete `src/routes/_authenticated/onboarding.tsx`; anything that redirects there points at `/onboarding`.
- `/` (`src/routes/index.tsx`) becomes screen 01 and keeps its session check: signed-in users still bounce to `/plan`.
- Migration on `standby_profiles`: add `pain_point text`, `access_mode text` (home / partners / selected), `free_day_used boolean default false`, `notify_optin boolean default false`, `coach_seen text[] default '{}'`. `StandbyProfileValues`, the zod validator in `plan.functions.ts`, and `loadStandbyProfile` / `persistStandbyProfile` in `plan.server.ts` extend to match.
- Free day is **tracked, not gated**: the flag is stored and surfaced as a banner on Plan; nothing is blocked, no pricing shown anywhere.
- Auth: `/auth` gains a "Continue with Google" button alongside the existing email form, and Google is enabled as a managed provider in the same change. No Apple button.
- Example cards on screens 08–11 reuse the existing `JudgmentPill` / pillar visual language so onboarding matches the real product surfaces; content is static mock data in a new `src/lib/aircue/onboarding-examples.ts`.
- Mobile-first single-column layout, desktop centers the same column; existing design tokens only.

## Out of scope

Contributor/badge verification, pricing or paywall screens, travel-frequency segmentation, feature carousel, boarding-probability numbers, and actual push notification delivery.
