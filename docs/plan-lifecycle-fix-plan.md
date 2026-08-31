# Plan Lifecycle Fix — Audit + Implementation Plan

**Status:** Audit complete — ready for Cursor implementation  
**Audience:** Cursor  
**Branch:** `main`  
**Scope:** Backend/domain lifecycle only — **no Home UI changes in this task**

**Related:** `docs/connection-viability-fix-plan.md` (do not modify Strategy/discovery)

---

## Problem

Home can show a Plan stuck indefinitely like:

```text
UA2110
Departure time has passed
FAVORABLE

Standbye is watching
```

An individual flight can expire while the overall Plan is still useful. Today the backend does **not** distinguish:

```text
current option has passed          ≠    entire Plan is no longer actionable
```

---

## Part 1 — Audit Findings

### Root cause (why the screenshot can stay stuck)

There is **no unified Plan lifecycle engine**. Lifecycle truth is fragmented:

| Layer | What exists today | Gap |
|-------|-------------------|-----|
| **Plans table** | `primary_option_id`, `travel_date`, `prefs` | No `complete` / `expired` / lifecycle state |
| **Options** | `rank`, `sched_dep_utc`, `is_current` | Passed options stay `is_current` until rerank removes them |
| **Primary** | Set once via `setPrimaryOption` / `useActivatePlan` | **Never auto-advanced** when departure passes |
| **Preferred** | Computed: `options[0]?.id` after rank sort | Not persisted; can diverge from primary |
| **Home selection** | `pickCurrentPlan`: soonest `travelDate >= today` | Ignores whether all options have passed |
| **UI countdown** | `PlanSnapshot` / `tz.formatCountdown` | Display-only “Departure time has passed” — no server action |
| **Watch** | Ends on travel day + 6h (`isTravelDayWatchOver`) | Not tied to option departures or plan completion |

**`resolvePlanLifecycle` does not exist anywhere in the repo.**

### Stale-active scenario (today)

1. User builds today’s plan; `useActivatePlan` sets `primary_option_id` to rank-1 and starts watch.
2. Primary departs (e.g. UA2110 8:15 AM).
3. Home still selects the plan via `pickCurrentPlan` — `travelDate === today`.
4. `PlanSnapshot` resolves `current = primary ?? preferred` → still shows departed UA2110.
5. Countdown renders **“Departure time has passed”** — but primary is never advanced.
6. Later options (UA1234 10:30, UA5678 12:05) remain in `plan.options[]` with lower rank.
7. Watch may continue until midnight UTC + 6h grace; plan row unchanged.

---

### Field inventory

#### Plans (`plans`)

| Field | Semantics |
|-------|-----------|
| `primary_option_id` | Traveler’s committed “current plan” flight — **persistent until manually changed** |
| `travel_date` | Calendar travel day (YYYY-MM-DD) |
| `prefs` | Search metadata, strategies, gateways, `emptyReason`, etc. |
| *(missing)* | No lifecycle status column |

#### Options (`plan_options`)

| Field | Semantics |
|-------|-----------|
| `rank` | Existing ranking order (reuse — do not invent new sort) |
| `sched_dep_utc` | Authoritative departure instant for pass detection |
| `dep_local` | Display fallback when UTC missing |
| `is_current` | `false` when dropped from trusted rerank — not when departure passes |
| `staffEligibility` / `operatorVerification` | Existing eligibility gates |

#### StandbyPlan (returned by `loadPlan`)

| Field | Semantics |
|-------|-----------|
| `primaryOptionId` | From `plans.primary_option_id` |
| `preferredOptionId` | **Computed** — rank-1 option id (`options[0]?.id`) |
| `options[]` | All `is_current = true` rows, sorted by rank |
| *(missing)* | No `lifecycleStatus`, `isActionable`, `completedAt` |

#### PlanSummary (Home list query)

| Field | Semantics |
|-------|-----------|
| `travelDate`, `createdAt` | Used by `pickCurrentPlan` |
| `hasPrimary`, `watching`, `primaryFlightLabel` | List display only |
| *(missing)* | No actionable / complete signal |

#### Watch (`watch_plans`)

| Field | Semantics |
|-------|-----------|
| `state` | `active` \| `ended` |
| `plan_option_id` | Anchor option — updated when user calls `setPrimaryOption` |
| `snapshot.primaryOptionId` | Updated on recheck — **does not write back to `plans.primary_option_id`** |

---

### Current “current option” semantics

**UI resolution** (PlanSnapshot, PlanView, PlanDetailSections):

```typescript
const selected = plan.primaryOptionId
  ? plan.options.find(o => o.id === plan.primaryOptionId)
  : null;
const recommended = plan.options.find(o => o.id === plan.preferredOptionId) ?? plan.options[0];
const current = selected ?? recommended;
```

If primary is set → **always show primary**, even after departure passes.

**Activation** (`use-plan-lifecycle.ts`):

- On plan create: if no primary, set to `preferredOptionId` (rank-1).
- Start watch via `beginWatch` (deduped per plan).

**Primary writes:**

| Function | Updates |
|----------|---------|
| `setPrimaryOption` | `plans.primary_option_id` + active watch `plan_option_id` |
| `useActivatePlan` | Initial primary on create |
| `planFromFlightNumber` | Primary to matched flight |

**No automatic primary advance on departure pass.**

---

### Home current-plan selection

**File:** `src/routes/_authenticated/plan.index.tsx`

```typescript
export function pickCurrentPlan(plans, todayISO) {
  const upcoming = plans.filter(p => p.travelDate >= todayISO);
  // soonest date first; same date → newest createdAt
  return sorted[0] ?? null;
}
```

**Invariant today:** Home current plan = soonest upcoming **calendar date**, not actionable plan.

**Does not use:** option timestamps, primary departure state, watch state, `hasPrimary`.

---

### `loadPlan` behavior

**File:** `src/lib/aircue/plan.server.ts`

Loads plan row + `is_current` options ordered by rank. Returns `StandbyPlan`.

**Does not:**

- Filter passed departures
- Advance primary
- Mark plan complete
- End stale watches

---

### Past / Upcoming grouping

**Plans list** (`plans.index.tsx`):

```typescript
groupOf(travelDate): days < 0 → "past" | days === 0 → "active" | else → "upcoming"
```

Past section shows **“Trip is over”** — calendar date only, not option-level.

**Same-day plan with all flights passed** still groups under **Today**, not Past.

---

### “Departure time has passed” copy

| Location | Trigger |
|----------|---------|
| `src/components/aircue/PlanSnapshot.tsx` → `Countdown` | `schedDepUtc <= now` |
| `src/lib/aircue/tz.ts` → `formatCountdown` | `ms <= 0` |

Display-only. No lifecycle mutation.

---

### Watch / monitoring

| Function | Role |
|----------|------|
| `beginWatch` | Anchor = `primaryOptionId ?? options[0]` |
| `recheckWatch` | Rerank on signals; **`primaryStillCurrent: true` hardcoded** |
| `decideWatchOutcome` | Supports `primary_missing` rerank when `primaryStillCurrent === false` — **dead path** |
| `isTravelDayWatchOver` | End watch: travel date end + 6h UTC |
| `run-watches` cron | Ends watch on calendar day over, not option exhaustion |

**Gap:** Watch can remain active while all usable options have departed.

---

### Plan completion logic

**Does not exist.**

Closest substitutes:

| Mechanism | Scope |
|-----------|-------|
| `isTravelDayWatchOver` | Watch only |
| `emptyReason: day_over` | Empty search at ranking time |
| UI “Trip is over” | `travelDate < today` in Plans list |

---

### Key files reference

| Concern | Path |
|---------|------|
| Plan load / primary / watch | `src/lib/aircue/plan.server.ts` |
| Server fn API | `src/lib/aircue/plan.functions.ts` |
| Types | `src/lib/aircue/standby.ts`, `PlanSummary` in plan.functions.ts |
| Home selection | `src/routes/_authenticated/plan.index.tsx` → `pickCurrentPlan` |
| Home display | `src/components/aircue/PlanSnapshot.tsx` |
| Activation | `src/lib/aircue/use-plan-lifecycle.ts` |
| Watch gate | `src/lib/aircue/watch-signal-gate.ts` |
| Watch recheck | `recheckWatch` in plan.server.ts |
| Watch cron | `src/routes/api/public/run-watches.ts` |
| Flight state | `src/lib/aircue/watch-flight-state.server.ts` |
| Schema | `supabase/migrations/*plan*` |

---

## Part 2 — Required Product Rule

A Plan remains **active** only while there is still something actionable in its travel window.

```text
current option has NOT passed
→ keep current option

current option HAS passed
+ another usable future option exists
→ advance Plan to best remaining usable option (by existing rank)

current option HAS passed
+ no usable future options remain
→ Plan is COMPLETE / expired for Home purposes

Never leave a dead current option as the persistent active recommendation.
```

**Do NOT implement:**

```text
preferred flight passed → complete Plan
```

A standby Plan can contain UA100, UA200, UA300. If UA100 passes but UA200/UA300 remain usable, the **Plan continues**.

---

## Part 3 — Implementation Plan

### Design principle

Create **one server/domain function** — do not scatter lifecycle logic across UI and watch.

```typescript
resolvePlanLifecycle(plan, now) → PlanLifecycleResult
```

Fit existing architecture. **Reuse existing rank order.** Do not invent a second ranking system.

---

### Proposed module

**New file:** `src/lib/aircue/plan-lifecycle.server.ts`

```typescript
export type PlanLifecycleStatus = "active" | "complete";

export interface PlanLifecycleResult {
  status: PlanLifecycleStatus;
  /** Resolved current option — may differ from persisted primary after advance. */
  currentOptionId: string | null;
  /** Whether primary_option_id should be updated in DB. */
  primaryAdvanced: boolean;
  newPrimaryOptionId: string | null;
  /** Whether watch should end (plan complete). */
  shouldEndWatch: boolean;
  /** Options still actionable in travel window. */
  actionableOptionIds: string[];
}

export function isOptionActionable(option: StandbyOption, now: Date, graceMin?: number): boolean;
export function nextActionableOption(options: StandbyOption[], afterOptionId: string | null, now: Date): StandbyOption | null;
export function resolvePlanLifecycle(plan: StandbyPlan, now?: Date): PlanLifecycleResult;
```

---

### What counts as “future usable option”

Reuse existing semantics. An option **cannot** become current if:

| Rule | Source |
|------|--------|
| Departure opportunity passed | `schedDepUtc <= now` (with small grace, e.g. 0–15 min — align with discovery’s 30 min cutoff or use 0 for strict) |
| `is_current === false` | Already excluded from `loadPlan` |
| `staffEligibility === "ineligible"` | Existing eligibility |
| Missing sched time | Fall back conservatively — do not promote without known future dep |

**Do not promote:** already-departed, ineligible, or stale options.

Optional enhancement (later): use watch `flightState: departed` on anchor — not required for v1 if UTC dep is authoritative.

---

### Option pass detection

**Primary signal:** `option.schedDepUtc`

```typescript
function isOptionDeparted(option: StandbyOption, now: Date, graceMs = 0): boolean {
  if (!option.schedDepUtc) return false; // unknown — don't auto-complete on missing time
  return new Date(option.schedDepUtc).getTime() <= now.getTime() - graceMs;
}
```

**Connections:** use **first segment** `schedDepUtc` (same as hero card departure).

Align grace with product: recommend **0 ms** (strict) or **15 min** (boarding buffer). Document choice in code.

---

### Advance behavior

When current/preferred primary has passed:

1. Filter `plan.options` to actionable-only (future dep, eligible, current).
2. Sort by existing `rank` ascending.
3. Pick **lowest rank** actionable option → new current.
4. Persist via existing `setPrimaryOption` path (updates watch anchor too).

```text
08:00 rank 1  ← passed
08:30 rank 2  ← passed
11:00 rank 3  ← becomes current at 10:00
13:00 rank 4
```

**Do not re-rank.** Do not call `rankStandbyOptions` for advancement.

---

### Completion behavior

When **zero** actionable options remain in the travel window:

1. Set lifecycle status → `complete`.
2. Clear or freeze `primary_option_id`? **Recommend:** keep primary for history but mark plan complete in `prefs.lifecycleStatus`.
3. End active watch (`state: ended`) if plan completes mid-day.
4. Exclude from Home active selection.

Plan row **not deleted** — remains in Past/history.

---

### Persistence strategy (minimal schema change)

**Preferred:** store lifecycle in `plans.prefs` (no migration required for v1):

```typescript
prefs.lifecycleStatus: "active" | "complete"
prefs.lifecycleResolvedAt: ISO timestamp
prefs.lifecyclePreviousPrimaryId?: string  // audit trail optional
```

**Alternative:** add `plans.lifecycle_status` column — cleaner queries for Home, requires migration.

**Recommendation for this task:** `prefs.lifecycleStatus` + `lifecycleResolvedAt` to ship fast; migrate column later if Home query needs it.

When `resolvePlanLifecycle` advances primary → call existing DB update (same as `setPrimaryOption` internals, or call `setPrimaryOption` itself).

---

### Where to call `resolvePlanLifecycle`

| Call site | Why |
|-----------|-----|
| **`loadPlan`** | Every plan read returns resolved lifecycle + advanced primary |
| **`loadPlanSummaries`** | Home/list can filter completed same-day plans |
| **`recheckWatch`** | Advance primary when anchor departed; end watch when complete |
| **`pickCurrentPlan`** (server-side helper) | Or move selection server-side: `pickActionablePlan(summaries, now)` |

**Do not call from:** ranking, strategy discovery, GF8, UI components (this task).

Suggested flow in `loadPlan`:

```typescript
const plan = buildStandbyPlanFromRows(...);
const lifecycle = resolvePlanLifecycle(plan, new Date());
if (lifecycle.primaryAdvanced && lifecycle.newPrimaryOptionId) {
  await persistPrimaryAdvance(client, userId, planId, lifecycle.newPrimaryOptionId);
}
if (lifecycle.status === "complete") {
  await markPlanComplete(client, userId, planId);
  await endActiveWatchIfAny(client, userId, planId);
}
return applyLifecycleToPlan(plan, lifecycle);
```

Return enriched `StandbyPlan`:

```typescript
lifecycleStatus: "active" | "complete"
currentOptionId: string | null  // resolved, may differ from primaryOptionId until persist
```

Or overwrite `primaryOptionId` in returned object after persist so UI reads correct value without frontend changes.

---

### Home current-plan query

**Today:** client `pickCurrentPlan` on `PlanSummary[]`.

**Fix options (pick one):**

**A — Server-side selection (preferred):**

Add `loadCurrentPlanSummary(client, userId, now)`:

```typescript
const summaries = await loadPlanSummaries(...);
return pickActionablePlan(summaries, now);
// skips lifecycleStatus === "complete" AND same-day plans with no actionable options
```

Expose via `getCurrentPlan` server fn; Home calls that instead of client filter.

**B — Enrich PlanSummary:**

Add `lifecycleStatus`, `isActionable` to `PlanSummary` during `summarizePlanRow` / lightweight lifecycle check.

Update client `pickCurrentPlan` to skip `complete` / non-actionable plans.

**Invariant after fix:**

```text
Home current Plan = actionable Plan
≠ most recently created Plan regardless of state
```

For multiple active plans: keep existing ordering (soonest date, then newest created) among **actionable-only** candidates.

---

### Monitoring impact

| Event | Watch behavior |
|-------|----------------|
| Primary advances to next option | Update `watch_plans.plan_option_id` via same path as `setPrimaryOption` |
| Plan completes | End active watch (`state: ended`, `ended_at`) |
| One flight expires, others remain | **Keep watching** — do not stop plan watch |
| Plan complete | Do not treat as actionable in recheck cron |

**Do not:** create duplicate watches on advance (`beginWatch` already dedupes).

**Wire `recheckWatch`:** pass `primaryStillCurrent: actionableOptions.includes(primaryId)` instead of hardcoded `true`.

When primary departed but plan still active → advance primary, continue watch on new anchor.

---

### Preserve (do not modify)

- `plan.strategies` / Strategy discovery / board intersection
- Connection viability (`connection-viability.server.ts`)
- AeroDataBox providers / scoring weights
- Every Way There / Find Another Way semantics
- Load parsing / ranking system
- Home UI components (this task)

---

## Part 4 — Tests

**New file:** `src/lib/aircue/__tests__/plan-lifecycle.test.ts`

### Test 1 — Current option passed, future option exists

```text
Input:
  primary: rank 1, dep 08:15
  rank 2: 10:30
  rank 3: 12:00
  now: 08:49

Expected:
  status: active
  currentOptionId → rank 2 (10:30)
  primaryAdvanced: true
```

### Test 2 — Multiple departed options skipped

```text
Input:
  deps: 08:00, 08:30, 11:00, 13:00
  now: 10:00

Expected:
  current → 11:00 option
```

### Test 3 — All options passed

```text
Expected:
  status: complete
  currentOptionId: null
  shouldEndWatch: true
  actionableOptionIds: []
```

### Test 4 — Current option still future

```text
Expected:
  no change, primaryAdvanced: false
```

### Test 5 — Completed plan remains retrievable

```text
loadPlan(planId) still returns plan
lifecycleStatus: complete
options preserved for history
```

### Test 6 — Multiple plans (Home selection)

```text
Plan A: today, all passed → complete, not actionable
Plan B: tomorrow, actionable

pickActionablePlan → Plan B
```

### Test 7 — Ineligible option not promoted

```text
rank 2 ineligible, rank 3 eligible future
→ advance to rank 3, skip rank 2
```

---

## Part 5 — Acceptance Criteria

- [ ] Passed flight cannot remain persistent active recommendation
- [ ] Plan auto-advances to highest-ranked usable future option (by existing `rank`)
- [ ] Plan completes when no usable future options remain
- [ ] Completed plans excluded from Home active/current plan query
- [ ] Completed plans remain in Past/history (not deleted)
- [ ] Watch follows advanced primary; ends when plan completes
- [ ] Existing ranking reused — no second ranking system
- [ ] No Strategy/discovery architecture changes
- [ ] `bunx tsc --noEmit` passes
- [ ] Focused lifecycle tests pass
- [ ] No Home UI changes in this task

---

## Part 6 — Implementation Checklist

### Core

- [ ] Create `src/lib/aircue/plan-lifecycle.server.ts`
- [ ] `isOptionActionable()` — UTC dep + eligibility + is_current
- [ ] `resolvePlanLifecycle()` — advance / complete logic
- [ ] `pickActionablePlan()` for Home selection

### Persistence

- [ ] `prefs.lifecycleStatus` + `lifecycleResolvedAt` on complete
- [ ] Reuse `setPrimaryOption` internals for advance (watch sync included)
- [ ] `endActiveWatchForPlan()` on complete

### Integration

- [ ] Call from `loadPlan` (persist + return resolved state)
- [ ] Enrich `loadPlanSummaries` / `summarizePlanRow` with lifecycle fields
- [ ] Update `recheckWatch`: real `primaryStillCurrent`, advance on departed anchor
- [ ] Server fn for Home current plan OR enriched summaries + updated `pickCurrentPlan`

### Tests

- [ ] `plan-lifecycle.test.ts` — tests 1–7 above
- [ ] Optional integration test in `recheck-watch.test.ts` for advance path

### Explicitly out of scope

- [ ] Home UI / PlanSnapshot changes
- [ ] Notification redesign
- [ ] Strategy / discovery / viability changes
- [ ] New ranking weights

---

## Part 7 — Final Report Template (fill after implementation)

### Root Cause

Why Home could show “Departure time has passed” indefinitely.

### Lifecycle Function

Where `resolvePlanLifecycle` lives and when it runs.

### Advance Behavior

How next option is chosen (rank order, actionable filter).

### Completion Behavior

When plan becomes `complete` and what gets persisted.

### Home Query

How completed/expired plans are excluded.

### Monitoring Impact

What changed in watch advance / end semantics.

### Tests

List tests + pass/fail.

### Typecheck

Result.

### Existing Failures

Separate unrelated pre-existing failures (e.g. `decideWatchOutcome` watch-signals tests).

---

## One-page summary

**Bug:** `primary_option_id` is set once and never advanced. Home selects by calendar date. UI shows “Departure time has passed” with no server lifecycle transition.

**Fix:** Centralize `resolvePlanLifecycle()` — advance to next ranked actionable option when current passes; complete plan when none remain; persist primary + lifecycle status; exclude completed plans from Home selection; sync watch anchor.

**Then:** Stop backend lifecycle work. Home UI changes come later against stable resolved `loadPlan` output.
