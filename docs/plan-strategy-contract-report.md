# PlanStrategy Contract — Implementation Report

## Architecture

Strategy discovery and grouping lives in **`src/lib/aircue/plan-strategy.ts`**. Ranking still discovers connection paths in **`findGateways()`** inside **`src/lib/aircue/ranking.server.ts`**, but the product contract is built separately via `buildStrategyCatalog()` and persisted on the plan.

Flow:

```
Origin board(s) → cheap pruning → onward verification → GatewayBuild[]
        ↓
buildStrategyCatalog(gatewayBuilds + rankedOptions)
        ↓
StoredPlanStrategy[] → plans.prefs.strategies
        ↓
loadPlan → attachOptionsToStrategies → plan.strategies (client-safe)
```

## Strategy Definition

**One Strategy = one unique ordered airport path.**

Identity is `path.join(">")`, e.g. `IAH>OKC>ORD`. Flight numbers, times, scores, load, hub classification, and aircraft are **not** part of strategy identity.

### Actionable Strategy (minimum evidence)

A connection strategy enters the catalog only when `findGateways()` confirms:

- An inbound leg from an approved origin to intermediate `X` exists
- A usable onward leg from `X` to an approved destination exists
- Layover is 60–360 minutes
- Carrier/access, same-city, destination-exclusion, detour, and timing filters pass

Direct strategies are created from materialized ranked options (nonstop paths). Unscored connection paths are included when gateway discovery verified them, even if they did not receive deep scoring.

## Strategy Contract

```typescript
export interface PlanStrategy {
  id: string;                 // e.g. "IAH>OKC>ORD"
  path: string[];             // e.g. ["IAH", "OKC", "ORD"]
  optionIds: string[];
  optionCount: number;
  bestOptionId: string | null;
  bestRank: number | null;
  gateway: GatewayOption | null; // connection evidence; null for direct
}
```

Persisted shape (`StoredPlanStrategy`) omits option ids; those are attached at load time from `plan_options`.

## Discovery Sources

| Path type | Source |
|-----------|--------|
| Direct `A → B` | Ranked options (`optionRefsFromRankedOptions`) |
| Connection `A → X → B` | Verified `GatewayBuild[]` via `connectionSeedsFromGatewayBuilds` |

Both merge in `buildStoredStrategies()` / `buildStrategyCatalog()`.

## Gateway Integration

`GatewayOption` remains an internal discovery artifact. Strategies copy gateway evidence onto connection paths (`path.length >= 3`) for existing inbound/onward proof. The `hub` field name is unchanged; strategy logic does **not** require hub status.

## Discovery vs Scoring

Separate budgets in `rankStandbyOptions`:

| Phase | Normal (best) | Wide |
|-------|---------------|------|
| **Strategy discovery** (`maxDiscover`) | 8 verified connection paths | 10 |
| **Deep scoring** (`scoreCount`) | 2–3 connection options | 4 |

Escape mode: discovery cap remains 10 (`ESCAPE_MAX_HUBS`); deep scoring remains 6 (`ESCAPE_SCORE_COUNT`).

All verified gateway builds feed `plan.strategies`; only the smaller `scoreCount` slice receives full `scoreConnection()` treatment.

## Connection Stations

**Any airport can be a connection point.** No hub whitelist or station classification is used in strategy creation.

## Multi-Origin

`findGateways()` now loops **all** `origins[]` from `expandAirports()`, not only `origins[0]`. Connection paths use the inbound leg’s origin (`build.best.first.origin`), so `HOU → X → ORD` is a distinct strategy from `IAH → X → ORD` when both are in scope.

## API Cost

- Discovery breadth increased modestly (8 vs former 3–5 hub cap) but still bounded
- Cheap filters (detour, same-city, dest exclusion, carrier) run **before** onward board calls
- `outOfTime()` stops discovery when the 20s / 30s budget expires
- No new graph crawler or blind per-airport fan-out

## Caching

No new cache layer. Existing `findOriginDepartures` / `findRouteLegs` reuse AeroDataBox `source_cache` behavior. Board fetches for deep scoring still skip legs already in the local `boards` map.

## Every Way There Condition

```typescript
if (plan.strategies.length > 1) {
  showEveryWayThere();
}
```

Multiple flights on the same path do **not** increase strategy count.

## Ranking

`bestOptionId` / `bestRank` come from existing option ranks on each path. Strategy ordering:

1. Strategies with scored options: lowest `bestRank` first
2. Unscored strategies: `discoveryOrder` from gateway enumeration
3. Tie-break: strategy `id` lexicographic

No independent strategy score is invented.

## Tests

Added **`src/lib/aircue/__tests__/plan-strategy.test.ts`** (11 tests):

- Same-route flights → 1 strategy, `optionCount = 4`
- Direct + non-hub connection → 2 strategies
- OKC / STL / AUS / DEN → 4 strategies
- Same connection path, multiple combinations → 1 strategy
- Unscored viable connection preserved (`bestOptionId: null`)
- Best rank = 1 among ranks 4/1/3
- Multi-origin path uses inbound leg origin (`HOU>DEN>ORD`)
- Deterministic identity under reorder

**Result:** 11 pass, 0 fail

## Live API Integration (IAH → ORD, 2026-08-31, UA)

Run with RapidAPI keys via env (never commit secrets):

```bash
AERODATABOX_RAPIDAPI_KEY=*** GOOGLE_FLIGHTS8_RAPIDAPI_KEY=*** \
  bun scripts/test-plan-strategy-live.ts
```

Script: **`scripts/test-plan-strategy-live.ts`**

| Tier | What it exercises | Result (2026-08-31 run) |
|------|-------------------|---------------------------|
| **AeroDataBox** | IAH departure board (2× 12h windows) | ✅ 587 departures (~2.6s) |
| **Google Flights 8** | `/api/v1/search` IAH→ORD | ✅ 35 itineraries (15 nonstop, 20 connection) (~0.8s) |
| **Live discovery sim** | ADB board → onward verify → `buildStrategyCatalog()` | ✅ 4 strategies (~22s) |
| **Unit tests** | `plan-strategy.test.ts` | ✅ 11 pass, 0 fail |
| **Full `rankStandbyOptions`** | End-to-end ranking + persist | ⏭ Skipped — requires `SUPABASE_SERVICE_ROLE_KEY` for `source_cache` + airport registry |

### Live strategies discovered

| Strategy ID | Path | Gateway evidence |
|-------------|------|------------------|
| `IAH>ORD` | IAH → ORD | direct (no gateway) |
| `IAH>DEN>ORD` | IAH → DEN → ORD | ✅ verified connection |
| `IAH>EWR>ORD` | IAH → EWR → ORD | ✅ verified connection |
| `IAH>SFO>ORD` | IAH → SFO → ORD | ✅ verified connection |

From 141 candidate intermediate stations on the IAH board, 3 passed onward + layover verification in the live sim (4 hubs checked with rate-limit spacing). **`plan.strategies.length > 1` → Every Way There eligible.**

### Live assertions

```json
{
  "adbReachable": true,
  "gf8Reachable": true,
  "liveStrategiesBuilt": true,
  "uniqueStrategyIds": true,
  "everyWayThereEligible": true,
  "connectionPathsDiscovered": true,
  "unitTestsPass": true,
  "fullRankAvailable": false
}
```

**Note:** Full `rankStandbyOptions` integration requires Supabase service role (cache + airports table). The live sim validates the same discovery → strategy catalog path using direct RapidAPI calls and production `buildStrategyCatalog()` helpers.

---

## FAQ: Why didn’t IAH → OKC → ORD show up?

**Short answer:** Not because OKC “isn’t a hub.” The Strategy layer has **no hub rule** — any station can be a connection point when the backend has evidence for a usable path.

On the live test (IAH → ORD, **2026-08-31**, **UA only**), OKC failed for two separate reasons:

### 1. Discovery budget — OKC wasn’t in the checked set

The live script only checked the **top 4** intermediate airports by UA departure count from IAH. OKC ranked **16th** (only **2** UA flights IAH → OKC that day). Production uses a wider cap (`maxDiscover = 8`), but OKC would still miss the cutoff on that day because it is low-frequency on the IAH board. DEN, EWR, and SFO were checked first and verified.

| Rank | Station | UA inbound flights from IAH |
|------|---------|-------------------------------|
| 1 | DEN | 6 |
| … | … | … |
| 16 | **OKC** | **2** |

### 2. Schedule sequencing — no usable UA same-day pair

A Strategy requires **both**:

- IAH → OKC exists
- OKC → ORD exists
- **60–360 minute layover** between arrival and onward departure (current rule)
- Carrier/access rules pass

**2026-08-31 schedule (UA):**

| Leg | When |
|-----|------|
| IAH → OKC | Afternoon (~12:20 / 14:47 depart) |
| OKC → ORD | Morning only (~07:19 / 09:15 depart) |

OKC → ORD flights **depart before** IAH → OKC arrivals land. Even the closest UA pair after UA6145 lands is ~24 minutes — below the 60-minute minimum.

An **AA** OKC → ORD would connect (~140 min layover), but the test used **UA-only** access. GF8 returned **0** IAH → OKC → ORD commercial itineraries for that date.

| Question | Answer |
|----------|--------|
| Can OKC ever be a Strategy? | **Yes** — when schedule + layover + access all pass |
| Is OKC blocked for not being a hub? | **No** |
| Why not on this test? | Low board rank + no valid UA same-day sequencing on Aug 31 |
| Would `plan.strategies.length > 1` still work? | **Yes** — DEN/EWR/SFO verified; OKC is not required |

On a day when OKC → ORD has a later departure after an IAH → OKC arrival, **`IAH>OKC>ORD` would appear** in `plan.strategies` like any other station.

---

## Standby vs commercial connection model

For standbys, the traveler is **not** buying one linked itinerary. They assemble:

1. Clear **IAH → OKC**
2. Clear **OKC → ORD**

If both exist and the **sequence is possible**, that is a real path — OKC does not need to be a hub, focus city, or anything special. The Strategy contract represents **one ordered airport path**, not one pre-built ticket.

### What the backend checks today

`findGateways()` still applies a **commercial-style connection filter**:

- Inbound A → X must exist
- Onward X → B must exist
- Some pair must have **60–360 minutes** between arrival at X and departure to B

Only then does `IAH>X>ORD` enter `plan.strategies`. The blocker is **not** hub status — it is this pairing rule plus discovery budget.

### Standby mental model vs current backend

| Model | Rule |
|-------|------|
| **Standby (product intent)** | Both legs exist + times can be sequenced same day — traveler pieces flights together |
| **Current backend** | Same, but requires a **60–360 min paired connection** and only checks top N stations by board frequency |

Even under standby thinking, you cannot use a flight that **already left**. On **Aug 31 UA**, OKC still would not qualify because all OKC → ORD UA flights were morning-only, before IAH → OKC afternoon arrivals — standby or not.

### Possible future relaxation (not implemented in this PR)

To align Strategy discovery more closely with standby travel:

> Inbound A → X and onward X → B both exist today, and at least one onward departs **after** at least one inbound arrival (minimum ground time, without a tight commercial-only cap)

That would surface more paths like OKC on days when timing works, without listing airports that have unrelated flights but no executable same-day sequence. Deep scoring and ranking would remain separate.

---

## Typecheck

`bunx tsc --noEmit` — pass (after test fixture fixes)

## Existing Failures

Pre-existing: **`watch-signals.test.ts`** (`decideWatchOutcome` expecting triggers like `primary_delay` but receiving `safety_refresh`). Unrelated to this task.

## Lovable Handoff

Render `plan.strategies` as supplied. Do not group options, infer connection stations, or decide what constitutes a travel path in React. Show **Every Way There** only when the backend-provided strategy collection contains more than one distinct path (`plan.strategies.length > 1`).
