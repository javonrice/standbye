# Standbye — final 22-screen onboarding

Rebuild the onboarding funnel around one story: tell Standbye where you're trying to go, it helps you decide what to try, adapts when the day changes, and uses any load you already have to make the plan better.

Today the funnel is 13 screens (`src/routes/onboarding.tsx`). It teaches recovery, missing loads and "no fake odds", but never explains the 1–4 public booking check, never shows Widen My Plan, and never shows a reported load changing the ranking. Copy also still calls the booking signal "availability".

## The sequence

1. Promise — "Stop planning standby one flight at a time." Get started / Sign in. (`/`, rewritten copy)
2. What gets old when you nonrev? — 4 one-tap options, auto-advance
3. We know the routine — portal → StaffTraveler → booking site → weather ritual → [Exactly]
4. Traveler type
5. Home airline (searchable, "I don't have one")
6. What can Standbye consider — home / home + partner-ZED / I'll choose
7. Home airport
8. Availability isn't the whole decision — two mock flights, booking check rows read "3 travelers" / "4 travelers", earlier flight still wins
9. The day changes — earlier cancel, booking tightens, better move becomes via DEN
10. Already stuck? — introduces Widen My Plan with a mock "where are you now / where do you still need to go"
11. Widened result — best way forward plus other realistic ways
12. What's the booking check? — 1/2/3/4 checkmarks → "4 travelers showing", explicit "not four open seats"
13. Why it's useful — comparison across flights plus movement over time as evidence
14. Have the actual load? — before/after ranking list where AA1375 moves to #1
15. Loads are interpreted for your trip — same 4 open · 3 listed reads differently solo vs party of 4
16. Trust — no invented odds, 72% struck through
17. Updates — mock notification, "go do something else"
18. Setup/loading — real profile-save time, checklist
19. Personalized reveal — airline, traveler type, access, home airport
20. Account creation — Google / email
21. First Standby Day included
22. Land in Home with origin prefilled

Screens 8–15 are static mock content; the user's home airport is used as origin where it reads naturally.

## Contextual, after onboarding

- First Watch: "Standbye watches the plan, not just one flight" → [Keep me updated], saves the notify preference.
- First load add: the add-load form gains "Are your travelers already included in that standby count?" (Yes / No / Not sure), alongside the existing open seats, standbys, cabin, source fields.

## Language rules applied everywhere in onboarding

- The 1–4 signal is always "booking check" / "N travelers showing" — never "Strong availability", never an open-seat count.
- Loads are presented as evidence that can re-rank the plan, not as a confidence badge.

## Technical notes

- `src/routes/onboarding.tsx` grows from 13 to 22 steps; new teaching screens are extracted into `src/components/aircue/onboarding/` so the route file stays readable, with mock content in `src/lib/aircue/onboarding-examples.ts` (add booking-check rows, widen-result mock, before/after ranking, party-interpretation mock).
- Screen 01 stays `src/routes/index.tsx` with new copy; it keeps the signed-in bounce to `/plan`.
- Screens 18–19 keep the existing `SetupStep` / `RevealStep`, which already save the draft profile after account creation via `/welcome`.
- Screen 21 reuses the existing `/welcome` gift screen; screen 22 is the existing Home plan builder.
- Add-load question stores one new nullable column on `reported_loads` (`party_included` text: yes / no / unsure), surfaced in the load detail copy. Scoring stays as-is in this pass — the answer is captured and displayed, not yet weighted, so ranking behaviour does not silently change.
- Apple sign-in is not included: no Apple provider is configured. Screen 20 ships Google + email; Apple can be added once the provider exists.

## Out of scope

Contributor/employee verification, pricing or paywall screens, real push delivery, and any change to ranking, access eligibility, or provider logic.
