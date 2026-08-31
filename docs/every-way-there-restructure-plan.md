# Every Way There — Full Plan Restructure

**Status:** Master plan — architecture + phased delivery  
**Audience:** Cursor, Lovable, product  
**Branch:** `cursor/plan-strategy-contract-98c4` (PR #10 — Strategy contract ✅)  
**Next:** Board intersection discovery (not yet implemented)

---

## 1. Product definition

### Every Way There answers

> **What realistic airport paths can get me from my origin to my destination?**

A path is an **ordered list of airports**, not a flight number or ticket:

```text
IAH → ORD
IAH → OKC → ORD
IAH → STL → ORD
IAH → DEN → ORD
```

The intermediate airport can be **any station**. No hub logic. No focus-city logic. No line-station vs small-station distinction.

### One path = one Strategy

```text
UA2032 ORD → CVG
UA3634 ORD → CVG
UA1732 ORD → CVG
UA730  ORD → CVG
```

= **one** Strategy: `ORD → CVG` (four options, one path).

### Every Way There vs Find Another Way

| Feature | Every Way There | Find Another Way |
|---------|-----------------|------------------|
| Scope | Viable paths **within the current Plan search** | Wider search when the Plan is not good enough |
| Mode | Normal Plan (`mode: standby`) | Escape (`mode: escape`) |
| Discovery budget | Normal (broader after intersection) | Wider caps, higher detour |
| Shared abstraction | Both use **`plan.strategies[]`** — same path model |

### Frontend gate

```typescript
if (plan.strategies.length > 1) {
  showEveryWayThere();
}
```

Multiple flights on the **same path** do **not** trigger Every Way There.

---

## 2. The architectural problem (today)

Discovery breadth and deep scoring are still too coupled in practice:

```text
IAH departure board
        ↓
141 possible intermediate stations
        ↓
sort / prune by frequency
        ↓
verify only ~8 stations (individual X → dest board calls)
        ↓
those paths → strategies (partial)
        ↓
deep-score ~2–4
        ↓
plan.options[] (ranked flights)
```

**Problem:** Clever low-frequency paths (e.g. **IAH → OKC → ORD**) can disappear before Standbye ever checks whether OKC can get you to ORD. OKC ranking 16th by IAH departure count is the canonical example.

That is fine for *“find the best connection quickly.”*  
It is **not** fine for *“show me the realistic ways I can get there.”*

Today `plan.options` partially stands in for the route universe. `plan.gateways` means *“some stations we investigated before hitting the cap”* — not *“all usable paths.”*

---

## 3. Target Plan architecture

Each layer has **one responsibility**.

```text
PLAN
│
├── Search scope
│   ├── origins:   [IAH, HOU]        (existing nearby expansion)
│   └── dests:     [ORD, MDW]        (existing metro expansion)
│
├── NETWORK SNAPSHOT  (cheap, bounded FIDS)
│   ├── origin departure board(s)
│   └── destination arrival board(s)
│
├── STRATEGY DISCOVERY  (in memory)
│   ├── intersect boards → candidate X stations
│   ├── pair inbound + onward times
│   ├── apply access / detour / same-city filters
│   └── emit plan.strategies[]
│
├── DEEP SCORING  (expensive, small budget)
│   ├── score top N connection attempts
│   ├── merge GF8 where applicable
│   └── emit plan.options[]
│
├── RECOMMENDATION
│   └── preferredOptionId, ranking, judgment
│
├── Loads / Monitoring / Activity  (unchanged semantics)
└── ...
```

### Two clear product layers

| Layer | Answers | Example |
|-------|---------|---------|
| **`plan.strategies[]`** | **What ways can I get there?** | `IAH>ORD`, `IAH>OKC>ORD`, `IAH>STL>ORD` |
| **`plan.options[]`** | **Which flights should I try?** | UA1234 nonstop, UA5678 via OKC, … |

```typescript
// Strategies = discovered possibilities
plan.strategies = [
  { id: "IAH>ORD",      path: ["IAH", "ORD"],      optionCount: 4, bestRank: 1, ... },
  { id: "IAH>OKC>ORD",  path: ["IAH", "OKC", "ORD"], optionCount: 1, bestRank: null, ... },
  { id: "IAH>STL>ORD",  path: ["IAH", "STL", "ORD"], ... },
];

// Options = deeply evaluated attempts
plan.options = [ /* ranked StandbyOption[] */ ];
```

**Strategies** = discovered paths (broad).  
**Options** = scored flight attempts (narrow).  
Ranking stays on **options**, not independent strategy scores.

---

## 4. PlanStrategy contract (Phase 1 — ✅ done)

**Do not replace this.** Board intersection makes it **more useful**, not obsolete.

### Definition

**One Strategy = one unique ordered airport path.**

Identity: `path.join(">")` → e.g. `IAH>OKC>ORD`

**Not** part of identity: flight number, time, score, load, hub classification, aircraft.

### TypeScript contract

```typescript
export interface PlanStrategy {
  id: string;                    // "IAH>OKC>ORD"
  path: string[];                // ["IAH", "OKC", "ORD"]
  optionIds: string[];
  optionCount: number;
  bestOptionId: string | null;
  bestRank: number | null;
  gateway: GatewayOption | null; // connection evidence; null for direct
}
```

Persisted as `StoredPlanStrategy` in `plans.prefs.strategies`; option ids attached at load via `attachOptionsToStrategies()`.

### Actionable Strategy (minimum evidence)

A connection path enters `plan.strategies` only when:

- Inbound **A → X** exists (from origin departure board)
- Onward **X → B** exists (from destination arrival board)
- At least one pair can be sequenced: onward dep **after** inbound arr + minimum ground time
- Carrier/access, same-city, destination-exclusion, detour filters pass

Do **not** surface speculative airports with no viable onward connection.

### Strategy ordering

1. Strategies with scored options: lowest `bestRank` first  
2. Unscored strategies: `discoveryOrder`  
3. Tie-break: strategy `id` lexicographic  

No fake numeric scores for unscored strategies.

### Code map (Phase 1)

| File | Role |
|------|------|
| `src/lib/aircue/plan-strategy.ts` | Strategy types, grouping, catalog builder |
| `src/lib/aircue/ranking.server.ts` | Discovery (to be replaced at feeder), scoring unchanged |
| `src/lib/aircue/plan.server.ts` | Persist/load `plan.strategies` |
| `src/lib/aircue/standby.ts` | `StandbyPlan.strategies` |
| `src/lib/aircue/__tests__/plan-strategy.test.ts` | Contract tests (11 pass) |

---

## 5. Board intersection discovery (Phase 2 — 🔜 next)

**This is the breakthrough that makes Every Way There truthful at scale.**

### Concept

Instead of:

```text
Fetch IAH departures
  → for each candidate X: fetch X → ORD board  (16+ calls)
```

Do:

```text
Fetch IAH departures     (2 calls)
Fetch ORD arrivals       (2 calls)
  → intersect destinations ∩ origins in memory
  → pair flight times in memory
  → emit all viable strategies
```

```text
IAH departure destinations:  DEN, OKC, AUS, STL, SFO, EWR, MCI, ...
ORD arrival origins:         DEN, OKC, STL, SFO, EWR, MCI, ...

Intersection → candidate X stations immediately:

  IAH → DEN → ORD
  IAH → OKC → ORD
  IAH → STL → ORD
  IAH → SFO → ORD
  IAH → EWR → ORD
  IAH → MCI → ORD
  ...
```

No per-station onward API call. FlightConnections mental model **without** a persisted route graph.

### AeroDataBox support

Same FIDS endpoint, add `direction=Arrival`:

```http
GET /flights/airports/iata/ORD/2026-08-31T00:00/2026-08-31T11:59
  ?direction=Arrival
  &withLeg=true
  ...
```

Returns `arrivals[]` with `departure.airport.iata` (origin X) + times.

### Live proof (IAH → ORD, 2026-08-31, UA)

| Metric | Current top-8 onward | Board intersection |
|--------|----------------------|-------------------|
| FIDS calls | **~18** | **4** |
| Intersecting stations | ~8 checked | **85–102** |
| Viable paths (60–360 min) | 3 in live test | **63** |
| OKC | Missed (rank 16) | **6 UA pairs** ✅ |
| Viable but missed by cap-8 | — | **56 of 63** |

Multi-airport (IAH+HOU, ORD+MDW): **~8 FIDS calls** — still far below per-X fan-out.

Reproduce:

```bash
AERODATABOX_RAPIDAPI_KEY=*** bun scripts/test-board-intersection.ts
```

### Algorithm

```text
1. For each approved origin:
     fetch departure boards (2 × 12h windows)
     → inbound legs: A → X with times, carriers

2. For each approved destination:
     fetch arrival boards (2 × 12h windows)
     → onward legs: X → B with times, carriers

3. Candidates X = inbound.destinations ∩ onward.origins
   minus same-city, dest itself, access exclusions

4. For each X (in memory):
     pair inbound A→X with onward X→B
     require onward.dep > inbound.arr + MIN_LAYOVER
     apply MAX_LAYOVER (Phase 3 may relax)
     apply detour ratio (batch geo — cheap)

5. Build GatewayBuild / ConnectionStrategySeed per viable X
   → buildStrategyCatalog()
   → plan.strategies[]

6. Deep-score only top scoreCount paths
   → plan.options[]
```

### API cost comparison

**Current connection discovery (single origin/dest):**

```text
IAH departure boards     = 2 calls
Top 8 stations × 2 windows each = 16 calls
TOTAL ≈ 18 FIDS calls → ~8 stations investigated
```

**Board intersection:**

```text
IAH departure boards = 2 calls
ORD arrival boards   = 2 calls
TOTAL = 4 FIDS calls → ~85–102 stations intersected, ~63 viable after timing
```

**Net:** More capability **and** fewer AeroDataBox calls in the normal case.

### Duplicate work removed

One IAH departure board answers:

- direct IAH → ORD flights  
- all intermediate destinations X  
- IAH → X times and carriers  

One ORD arrival board answers:

- every X that reaches ORD  
- X → ORD times and carriers  

No repeated “does OKC go to ORD?” provider queries.

### Implementation checklist (Phase 2)

- [ ] `fetchArrivalBoard()` in `aerodatabox.server.ts` (mirror departures)
- [ ] Extend `fidsCacheKey()` with direction: `…:{Departure|Arrival}` (avoid cache collision)
- [ ] New `discoverConnectionStrategiesViaBoardIntersection()` in `ranking.server.ts` (or sibling module)
- [ ] Replace per-station `findRouteLegs(hub, dest)` loop inside `findGateways()`
- [ ] Feed output into existing `buildStrategyCatalog()` — **PlanStrategy contract unchanged**
- [ ] Multi-origin: union departure dests from IAH + HOU
- [ ] Multi-dest: union arrival origins from ORD + MDW
- [ ] Preserve 20s search budget (`outOfTime()`); return partial strategies if budget expires
- [ ] Tests: OKC appears when in intersection; cap-8 miss cases covered
- [ ] Update live test scripts

### What Phase 2 does **not** change

- Scoring weights, judgment, pillars  
- GF8 merge behavior  
- Load re-ranking semantics  
- DB schema  
- Escape vs normal UX  
- PlanStrategy interface  
- Frontend (hold until Phase 2 lands)

---

## 6. Standby viability rules (Phase 3 — later, separate PR)

Current connection filter is **commercial-itinerary-like**:

```text
MIN_LAYOVER = 60 minutes
MAX_LAYOVER = 360 minutes (6 hours)
```

For nonrev standbys, travelers may piece flights with **longer sits**:

```text
IAH → OKC  9:00 AM
sit in OKC 7 hours
OKC → ORD  5:00 PM
```

**Phase 3 proposal** (product + backend, not combined with Phase 2):

```text
Viable if:
  onward.dep > inbound.arr + MIN_GROUND_TIME
  and both legs fall within the same travel-day window we already honor
```

Relax or remove the 6-hour maximum for **strategy discovery**; keep deep scoring conservative if needed.

**Do not block Phase 2 on this.**

---

## 7. End-to-end Plan build flow (target)

```text
Create Plan
   ↓
┌──────────────────────────────────────┐
│  FETCH NETWORK SNAPSHOT              │
│  • origin departure board(s)         │
│  • destination arrival board(s)      │
│  • direct O→D scan (existing)        │
│  (~4–8 FIDS calls)                   │
└──────────────────────────────────────┘
   ↓
┌──────────────────────────────────────┐
│  DISCOVER PATHS IN MEMORY              │
│  • intersect boards                  │
│  • pair times                        │
│  • access / detour / same-city       │
│  → plan.strategies[]                 │
└──────────────────────────────────────┘
   ↓
┌──────────────────────────────────────┐
│  DEEP SCORE BEST CANDIDATES ONLY     │
│  • scoreCount connections (2–4)    │
│  • GF8 merge (1 call)                │
│  • availability boards (budgeted)    │
│  → plan.options[]                    │
└──────────────────────────────────────┘
   ↓
Rank → persist → loadPlan → client
```

### Escape (Find Another Way)

Same Strategy abstraction, wider parameters:

| Parameter | Normal | Escape |
|-----------|--------|--------|
| Detour max | 1.45 | 2.0 |
| Strategy discovery breadth | intersection (all viable) | same + wider detour |
| Deep score count | 2–4 | 6 |
| Budget | 20s | 30s |

---

## 8. Frontend contract (Lovable — after Phase 2)

**Hold Every Way There UI until board intersection ships.**  
The Strategy contract is ready; discovery breadth is not.

When ready:

```typescript
// Show Every Way There
if (plan.strategies.length > 1) {
  showEveryWayThere();
}

// Render paths — do NOT infer topology in React
plan.strategies.map((strategy) => renderStrategy(strategy));
```

### Rules for Lovable

- Render `plan.strategies` as supplied by backend  
- Do **not** group options by route in React  
- Do **not** infer connection stations from `plan.options`  
- Do **not** decide what constitutes a travel path client-side  
- `plan.options` = scored flight attempts; `plan.strategies` = path catalog  

### Strategy row UI inputs

```typescript
strategy.path          // ["IAH", "OKC", "ORD"]
strategy.optionCount   // flights on this path
strategy.bestOptionId  // null if unscored but viable
strategy.bestRank      // null if unscored
strategy.gateway       // inbound/onward evidence for connections
```

---

## 9. What we are NOT building

| Out of scope | Why |
|--------------|-----|
| Global route graph / adjacency DB | Opportunistic same-day discovery is enough for v1 |
| FlightConnections clone | Board intersection gives similar breadth cheaply |
| Multi-hop A→X→Y→B (v1) | Direct + one-stop only |
| Hub whitelist | Contradicts product |
| Strategy-level scoring | Reuse option ranks for `bestOptionId` |
| Replacing PlanStrategy | Contract is correct; improve the feeder |
| Frontend redesign in backend PRs | Types only for compilation |

---

## 10. Phased delivery

### Phase 1 — PlanStrategy contract ✅ (PR #10)

- [x] `PlanStrategy` / `StoredPlanStrategy` types  
- [x] `plan.strategies` on `StandbyPlan`  
- [x] Discovery vs deep scoring budgets separated (partial — still top-N onward)  
- [x] Multi-origin gateway seeding  
- [x] Unscored strategies can exist (`bestOptionId: null`)  
- [x] Unit tests + report  

**Merged direction:** Keep. Do not undo.

### Phase 2 — Board intersection discovery 🔜

- [ ] Arrival board client + cache keys  
- [ ] Replace per-station onward FIDS fan-out  
- [ ] Broad truthful `plan.strategies[]`  
- [ ] Live test + integration tests  
- [ ] Update docs  

**Gate for Lovable Every Way There UI.**

### Phase 3 — Standby layover relaxation (optional follow-up)

- [ ] Relax MAX_LAYOVER for strategy discovery  
- [ ] Document new viability rule  
- [ ] Tests for long-sit connections  

### Phase 4 — Frontend (Lovable)

- [ ] Every Way There from `plan.strategies`  
- [ ] Path picker / comparison by strategy  
- [ ] No client-side route inference  

---

## 11. Longer-term benefits

### Load uploads without rediscovering the network

Once `plan.strategies` is persisted:

```text
User uploads load
   ↓
Re-score options within known strategies
   ↓
Update bestOptionId / ranking
   ↓
No new FIDS fan-out for path discovery
```

### Shared boards across Plans

Cached departure/arrival boards reuse across:

- direct search  
- strategy discovery  
- watch / cancel pressure (existing cache philosophy)  

---

## 12. Acceptance criteria (complete vision)

| # | Criterion | Phase |
|---|-----------|-------|
| 1 | `PlanStrategy` exists; one path = one strategy | 1 ✅ |
| 2 | Direct + one-stop paths represented | 1 ✅ |
| 3 | Any airport may be connection point; no hub rule | 1 ✅ |
| 4 | Same-path flights grouped | 1 ✅ |
| 5 | Discovery breadth separated from deep scoring | 1 ✅ (2 completes it) |
| 6 | Unscored viable strategies can exist | 1 ✅ |
| 7 | `plan.strategies` reaches client | 1 ✅ |
| 8 | Multi-origin discovery | 1 ✅ / 2 completes |
| 9 | OKC-like low-frequency paths discoverable | **2** |
| 10 | ~4 FIDS calls vs ~18 for connection discovery | **2** |
| 11 | React does not infer route topology | 4 |
| 12 | `plan.strategies.length > 1` → Every Way There | 4 |
| 13 | No global route graph | all |
| 14 | API usage budget-aware | all |

---

## 13. Reference documents

| Document | Contents |
|----------|----------|
| `docs/every-way-there-restructure-plan.md` | **This file** — master plan |
| `docs/plan-strategy-contract-report.md` | Phase 1 implementation report + FAQ |
| `docs/board-intersection-discovery-investigation.md` | Phase 2 investigation + live proof |
| `docs/every-way-there-backend-audit.md` | Pre-implementation audit |
| `scripts/test-plan-strategy-live.ts` | Live ADB/GF8 + strategy tests |
| `scripts/test-board-intersection.ts` | Board intersection proof |

---

## 14. One-page summary

**Problem:** `plan.options` and capped gateway discovery cannot honestly answer “what ways can I get there?” Low-frequency connection stations disappear before verification.

**Solution:** Two-layer Plan:

- **`plan.strategies`** — broad path catalog (Every Way There)  
- **`plan.options`** — narrow scored flight attempts (recommendation)  

**Phase 1 (done):** PlanStrategy contract + persistence + tests.

**Phase 2 (next):** Board intersection — origin departures + destination arrivals, intersect in memory, ~4 FIDS calls instead of ~18, ~63 viable paths instead of ~8 checked.

**Phase 3 (later):** Relax max layover for standby-style long sits.

**Phase 4 (Lovable):** UI from `plan.strategies`; gate on Phase 2.

**Rare win:** More capability **and** lower API cost at the same time — without replacing the Strategy contract you already have.
