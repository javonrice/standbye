# Standbye — Rork Prompt Pack

Paste into **Rork Plan Mode** first. Do not ask Rork to build everything in one shot.
Use **Stage 1** as the opening prompt. After Plan Mode Q&A and a good skeleton, run Stages 2–4 one at a time.

Based on: `docs/ui-wireframe-function-map.md`  
Rork pattern: Purpose → Screens → Data → Exclusions (+ feel, motion, constraints)

---

## Stage 1 — Opening prompt (copy this)

```text
[Purpose]
Build Standbye — a mobile app for airline employees and standby travelers.
The traveler builds one Plan for a route and day, then works that Plan: Standbye
shows the best flight to try right now, watches it, and advances to the next
usable flight when the current one departs. When nothing left is usable, the
Plan is Done.

Target user: airline staff / standby travelers on a phone, often in an airport,
one-handed, under time pressure.
Mood: calm, confident, travel-day focus — not a dashboard, not a booking engine,
not a flight tracker full of noise.
Primary goal: reduce friction. One decision at a time. Optimize for clarity and
speed over feature count.
This should feel high-production and polished. Prefer smooth transitions and
responsive taps over adding more screens.

[Main screens]
Bottom tabs only: Home · Plans · You

1. Splash — brand + “Get started” / “I have an account”
2. Onboarding (4 steps) — traveler type, home airline, travel access, home airport → “Plan my first trip”
3. New Plan — From, To, When, Travelers; collapsed Trip options; primary CTA “Build my plan”; link “Have a flight number?”
4. Home / Current Plan — THE main screen. One composition only:
   - Brand + route + date
   - One current flight (number, time, countdown, judgment label, one short why line)
   - “Standbye is watching”
   - “N other ways still open”
   - CTAs: [See other ways] [Add what I see]
   - Quiet “What changed” one-liner if needed
   - “New plan” secondary
5. Ways — list for THIS plan only: Current · Still open · Passed; optional path chips (Nonstop / via DEN…); tap open row → sheet with [Make this current]
6. Load — pick flight (default current), open seats, standbys, cabin; or upload screenshot; [Save to plan]
7. Activity — timeline of changes for THIS plan (not a global tab)
8. Plans library — sections Today (Current / Done), Upcoming, Past; + New plan
9. You — home airline, access summary, edit access, notifications, how it works, sign out

Home states (must implement):
A) No actionable plan → show New Plan
B) Active plan → Current Plan layout above
C) Current flight advanced quietly → same layout, new flight
D) Plan complete same day → empty Home: “Today’s trip is done” + link to Plans / New plan

[Design direction]
Mobile-first. One composition per screen — not a dashboard.
Home first viewport: brand, one headline route, one current flight block, one short status, one CTA group. No stats strips, no card grids in the hero, no floating badges on the flight.
Expressive typography (not Inter/Roboto/system default). Soft atmospheric background (subtle sky/gradient texture), not flat gray or purple-on-white.
No purple-indigo AI gradient theme. No cream+terracotta serif cliché. No dark-mode-by-default. No glow stacks, no pill clusters, no emoji decoration.
Cards only where the user interacts (list rows / sheets). Hero and Current Plan are not cards.
2–3 subtle intentional motions: screen enter, countdown tick, switch-current confirm sheet.

[Data structure]
Use local mock data first; keep a clean data layer so backend can replace later.

UserProfile:
- travelerType
- homeAirline
- travelAccess (list of airline codes)
- homeAirport
- notifyMode

Plan:
- id, origin, dest, travelDate, travelers
- status: "active" | "complete"
- currentFlightId (nullable)
- watching: boolean
- createdAt

Flight (belongs to a Plan):
- id, planId, rank
- flightLabel (e.g. UA2110)
- origin, dest, depLocal, schedDepUtc
- judgment: "favorable" | "mixed" | "riskier"
- whyLine (short string)
- state: "current" | "open" | "passed"
- eligible: boolean

LoadReport:
- id, planId, flightId
- openSeats, standbys, cabin
- source: "manual" | "screenshot"
- checkedAt

ActivityEvent:
- id, planId
- at
- headline
- kind: "built" | "watching" | "advanced" | "load" | "complete" | "switched"

Rules (UI must reflect these):
- Building a Plan auto-sets rank-1 eligible open flight as current and sets watching=true
- When current flight’s schedDepUtc passes and another open eligible flight exists → advance current to lowest rank still open (quiet)
- When no open eligible flights remain → status=complete, watching=false; Home skips it; Plans shows under Today → Done
- Done is NOT the same as Past (Past = travelDate before today)
- Traveler language only: Plan, current flight, other ways, watching, Done — never say primary, option, watch object, strategy, escape

[Shared state]
PlanContext (Context + useReducer) holds:
- profile
- plans[]
- selectedPlanId for library → home handoff
Actions: CREATE_PLAN, SET_CURRENT_FLIGHT, ADVANCE_IF_NEEDED, COMPLETE_PLAN, ADD_LOAD, ADD_ACTIVITY, SET_PROFILE
Screens are UI only; no business rules duplicated in random components.

[Exclude]
- No Updates / Notifications global tab
- No Escape as a separate product mode
- No booking / payment / seat maps
- No real airline APIs yet (mock flights only)
- No social, ads, or chat
- No admin / settings sprawl beyond You
- Do not invent extra tabs or dashboards
- Do not put a full flight list on Home
- Do not use cards in the Current Plan hero

[Build instruction for this turn]
Plan mode first: confirm the data model and navigation, ask clarifying questions only where needed.
Then build ONLY: navigation shell (3 tabs) + Splash + New Plan + Home Current Plan with mock data for one sample active plan (ORD→LAX today, 1 current + 2 open + 1 passed).
Do not build Ways, Load, Activity detail, Plans library contents, or onboarding yet — stub tabs/buttons that navigate to placeholder screens labeled with the screen name.
At the end, list every file you created or changed.
```

---

## Stage 2 — Ways + switch current (after Stage 1 looks right)

```text
Add the Ways screen and Make-this-current flow for the selected Plan only.

Ways layout:
- Header: ← route · date
- Sections: CURRENT · STILL OPEN · PASSED
- Optional path filter chips (Nonstop, via DEN) — visual only for now
- Tap an open row → bottom sheet: flight label, why line, [Make this current] [Keep looking]

On confirm: SET_CURRENT_FLIGHT, add ActivityEvent kind=switched, return to Home.
Quiet advance still works when time passes (simulate with a “Simulate departure” debug button on Home for now).

Do not change Splash, New Plan layout, tab structure, or data types except adding any fields Ways needs.
Do not add a global Updates tab.
At the end, list every file you changed.
```

---

## Stage 3 — Plans library + complete / past states

```text
Implement Plans library and Home empty-complete state.

Plans sections:
- TODAY — active plans labeled Current; complete plans labeled Done
- UPCOMING — travelDate after today
- PAST — travelDate before today
Tap Current → Home with that plan. Tap Done/Past → read-only summary (no watching CTA).

Add a debug control: “Complete plan” to mark status=complete.
Home state D: if no active plan but a completed plan today exists, show “Today’s trip is done” + links.

Do not redesign Home Current Plan when an active plan exists.
Do not change Ways sheet behavior.
At the end, list every file you changed.
```

---

## Stage 4 — Load + Activity + Onboarding + You

```text
Add Load, Activity, Onboarding (4 steps), and You.

Load: default flight = current; seats, standbys, cabin; Save creates LoadReport + activity; optional fake “screenshot attached” toggle.
Activity: chronological list for current plan only; entry from Home one-liner.
Onboarding: four taps → write UserProfile → land on New Plan.
You: show profile summary + edit access placeholder + sign out clears local profile.

Polish: subtle screen transitions, responsive button presses, keep Current Plan as one calm composition.
Do not add new tabs. Do not add Escape/booking.
At the end, list every file you changed.
```

---

## Revision template (use every correction)

```text
On the [SCREEN] screen only: [exact change].
Do not change [list of working areas].
Do not rename data types.
At the end, list every file you changed.
```

---

## Why this shape (Rork)

| Rork guidance | How this pack uses it |
|---------------|------------------------|
| Purpose / user / mood / goal first | Stage 1 header |
| Name screens explicitly | Numbered Main screens |
| Data model before polish | Data structure + PlanContext |
| Exclusions to stop CRUD drift | Exclude block |
| Stage the work | Stages 1→4 |
| Structure before polish | Motion/polish only in Stage 4 |
| Scoped revisions | Revision template |
| Plan mode before build | Opening instruction |
