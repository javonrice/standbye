# Standbye Escape — "Stuck? Find another way."

Escape is an on-demand mode inside the existing Standby Day, not a new product surface or a
new SKU. Normal Plan stays cheap and fast; Escape is where Standbye spends real search effort.

## Where it shows up

- **Plan home** — below the search card, a quiet divider then: "😬 Stuck or trying to get home?
  Standbye can look for unconventional ways to keep you moving." with **Find an escape route →**.
- **Contextually**, when the current plan is deteriorating — a plan whose options are thin
  (one useful nonstop left, or recovery room poor/tight) and any watched plan in the same
  state. The existing option/plan screens and the Plan Changed takeover gain a secondary
  **Find an escape route** action next to **See backups**.

Copy is always "Stuck? Find another way." — never "Need to get home?", since people escape
toward vacations too.

## Escape entry screen (`/escape`)

Three questions, nothing else. No gateway picker — finding the gateway is Escape's job.

- Where are you now? (airport field, prefilled from the plan or home airport)
- Where do you need to get? (airport field, prefilled from the deteriorating plan)
- When: **Today · leave as soon as I can** (default) or **Choose another time** (date + earliest
  departure time)

Then **Find me a way →**, with the existing searching overlay, re-labelled for Escape:
looking beyond the usual route, finding stations you can actually reach, checking what leaves
there, checking availability and operations, ranking escapes.

## Escape results (`/escape/$planId`)

Header: "Escape to Chicago · From IAH · Starting now", then "Standbye found 5 realistic ways to
keep moving."

- **Best escape** — a full card in our existing card language: judgment pill, `IAH → OKC → ORD`,
  "2 shots to OKC", "3 useful ORD flights after", the four pillar rows (Availability,
  Operations, Recovery, Total detour), the honest line "Not a typical connection — just a
  useful way home today.", and **Use this escape** (creates/attaches the watch plan exactly the
  way choosing an option does today).
- **The rest** — compact gateway rows reusing `RouteOptionRow`/`GatewayCard`: dot, Via STL,
  "3 shots in · 4 onward", chevron into the existing gateway detail screen.
- Nonstops that still exist are shown first if any are worth trying, so Escape never hides an
  obvious answer.
- **Expert fallback** at the bottom: "Know a route Standbye missed? **Check via a specific
  airport**" → type a code (OKC) and Standbye evaluates `IAH → OKC → ORD` with the same engine
  and renders it as a normal escape card, including a plain reason when it doesn't work
  (no onward flights today, layover impossible, airline you can't use).

## How the search differs from normal Plan

Same engine, an Escape profile on top of it:

- Candidate stations come from the origin's actual departure board — **any** airport that is
  reachable today and has a realistically connectable same-day onward flight to the
  destination. Explicitly not restricted to hubs, so IAH → OKC → ORD can win.
- The gateway cap rises well above normal Plan (roughly 3–5 → 10–12 finalists), and the
  detour tolerance loosens beyond `wide` while still rejecting absurd routings.
- Pruning stays strict: impossible or unreasonable layovers, arrival after onward departure,
  airport changes, carriers the traveler can't use, obvious backtracks, dead-end gateways with
  no recovery of their own, unwanted overnights, absurd total elapsed time.
- **One connection maximum in V1.**
- Ranking, in weight order: can they get on the first leg, number of realistic first-leg shots,
  number of useful onward shots, public availability on both legs, connection feasibility,
  current operations, recovery room at the gateway, total elapsed time/detour, and an explicit
  penalty for needing two standby clears.
- Cost control: the origin board is fetched once and the per-airport boards are cached for the
  session, so an examined station is free afterwards; onward checks are resolved for finalists
  only, and a specific-airport check costs one extra board.

## Standby Day / pricing

No payment prompts anywhere — pricing isn't live. Escape is recorded as **part of** the
existing Standby Day for that origin, destination and date, never as a second one. If no
Standby Day is active for that pair, Escape opens one (the same accounting we already track
for a normal plan). Usage is tracked so pricing rules can be applied later without rework.

## Technical notes

- `standby.ts`: add `EscapeRoute` (hub, both legs, shots in, onward count, pillars, detour
  minutes, caveat) and an `escape` routing profile alongside `RoutingMode`.
- `ranking.server.ts`: extract the gateway builder into an escape-aware path — parameterised
  `maxHubs`, detour ceiling, and a station filter that does not favour hub size; add the
  two-clear penalty and shot-count weighting to the existing scoring, plus a
  `rankEscapeRoutes` entry point and a single-hub `evaluateEscapeVia(hub)` for the expert check.
- `plan.server.ts` / `plan.functions.ts`: `createEscapePlan` and `checkEscapeVia` server fns.
  Escape plans persist through the existing `plans` table with
  `prefs.mode = "escape"` and `prefs.escapeRoutes` — the `prefs` column is JSON, so no
  migration is needed. Standby-day attribution is written into `prefs` too.
- New routes: `src/routes/_authenticated/escape.index.tsx` and
  `escape.$planId.tsx`. Reuse `AirportField`, `SearchingOverlay`, `CueBadge`, `PillarGrid`,
  `GatewayCard`, `RouteOptionRow`; no new design language.
- Plan home, plan detail and the Plan Changed takeover gain the entry points described above.
- Existing tests stay green; typecheck via `tsgo`.
