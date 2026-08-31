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

## Typecheck

`bunx tsc --noEmit` — pass (after test fixture fixes)

## Existing Failures

Pre-existing: **`watch-signals.test.ts`** (`decideWatchOutcome` expecting triggers like `primary_delay` but receiving `safety_refresh`). Unrelated to this task.

## Lovable Handoff

Render `plan.strategies` as supplied. Do not group options, infer connection stations, or decide what constitutes a travel path in React. Show **Every Way There** only when the backend-provided strategy collection contains more than one distinct path (`plan.strategies.length > 1`).
