# Plan Lifecycle Fix — Audit + Implementation Plan

**Status:** Audit complete — revised architecture — ready for Cursor implementation  
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

### Architecture (locked)

**Do not mutate the database inside `loadPlan()`.** Opening a screen, refetching React query, or reading plan history must not silently change `primary_option_id`, end watches, or write lifecycle prefs. Every caller of `loadPlan()` would become an accidental mutation trigger (background jobs, monitoring, API reads, concurrent requests, notifications).

Split responsibilities:

```text
                    ┌─────────────────────────┐
                    │       loadPlan()        │
                    │        READ ONLY        │
                    └────────────┬────────────┘
                                 ↓
                    ┌─────────────────────────┐
                    │ resolvePlanLifecycle()  │
                    │          PURE           │
                    └────────────┬────────────┘
                                 ↓
             ┌────────────────────────────────────┐
             │ resolveAndPersistPlanLifecycle()   │
             │ primary + prefs + watch mutations  │
             └────────────────────────────────────┘
                         ↓               ↓
                    ACTIVE            COMPLETE
                         ↓               ↓
               advance if needed    end watch
                         ↓
                 Home can show it   Home skips it
```

| Function | Role |
|----------|------|
| `loadPlan()` | Read plan row + options. **No writes.** May attach **read-only** resolved view via pure `resolvePlanLifecycle()` for display — but must not persist. |
| `resolvePlanLifecycle(plan, now)` | **Pure** decision: active vs complete, advance target, actionable set. |
| `resolveAndPersistPlanLifecycle({ client, userId, planId, now })` | Load → resolve → write primary / lifecycle prefs / watch changes. |

**Write orchestrator call sites** (places that own lifecycle transitions):

```text
Home current-plan request     → resolve + persist before returning Home payload
Watch recheck                 → resolve + persist before signal evaluation
Watch cron                    → resolve + persist when due (or end on complete)
Plan activation / refresh     → resolve + persist after activation paths that need it
```

**Do not call write orchestrator from:** generic `loadPlan`, plan detail history reads, tests that only need stored state, ranking, strategy discovery.

---

### Design principle

One **pure** lifecycle function plus one **explicit write orchestrator**. Fit existing architecture. **Reuse existing rank order.** Do not invent a second ranking system.

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

/** Pure — no DB I/O. */
export function resolvePlanLifecycle(plan: StandbyPlan, now?: Date): PlanLifecycleResult;

/** Apply pure resolution to a StandbyPlan for read-only display (no persist). */
export function applyLifecycleView(plan: StandbyPlan, result: PlanLifecycleResult): StandbyPlan;
```

**Write orchestrator** (same module or `plan.server.ts`):

```typescript
export async function resolveAndPersistPlanLifecycle(input: {
  client: unknown;
  userId: string;
  planId: string;
  now?: Date;
}): Promise<{ plan: StandbyPlan; lifecycle: PlanLifecycleResult; persisted: boolean }>;
```

Flow:

```typescript
const plan = await loadPlan(client, userId, planId);           // read only
const lifecycle = resolvePlanLifecycle(plan, now);            // pure
if (lifecycle.primaryAdvanced || lifecycle.status === "complete") {
  await persistLifecycleMutations(client, userId, planId, lifecycle);  // writes
  const refreshed = await loadPlan(client, userId, planId);   // read again
  return { plan: applyLifecycleView(refreshed!, lifecycle), lifecycle, persisted: true };
}
return { plan: applyLifecycleView(plan, lifecycle), lifecycle, persisted: false };
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

1. Set lifecycle status → `complete` in `prefs.lifecycleStatus`.
2. **Keep** `primary_option_id` and `travel_date` unchanged for history.
3. End active watch (`state: ended`) if plan completes mid-day.
4. Exclude from Home active selection via `lifecycleStatus === "complete"` (not by rewriting `travel_date`).

Plan row **not deleted** — remains retrievable for history.

---

### Completion vs calendar grouping (do not conflate)

Backend lifecycle:

```typescript
lifecycleStatus: "active" | "complete"
```

is **orthogonal** to calendar date grouping.

A plan that completes at 11 AM on its travel day has:

```text
travelDate: 2026-08-31
lifecycleStatus: complete
```

It is **not** a “past date” plan at 11 AM — do not bend `travelDate` or backend date math to implement completion.

| Concern | Mechanism |
|---------|-----------|
| Plan exhausted mid-day | `lifecycleStatus: complete` |
| Calendar day rolled over | existing `travelDate < today` grouping |

UI (later, out of scope for this task) may show **Today → Completed** or move under Past — that is presentation. Backend stores both facts honestly.

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

**All writes** go through `resolveAndPersistPlanLifecycle()` → reuse `setPrimaryOption` for advance (watch anchor sync) and dedicated helpers for complete + end watch.

---

### Where to call lifecycle functions

| Call site | Pure `resolvePlanLifecycle` | Write `resolveAndPersistPlanLifecycle` |
|-----------|----------------------------|----------------------------------------|
| **`loadPlan`** | Optional: `applyLifecycleView` for read-only resolved display | **Never** |
| **Home current-plan server fn** | After persist, for selection | **Yes** — before returning current plan to Home |
| **`recheckWatch`** | After persist, before signals | **Yes** — first step of recheck (see below) |
| **Watch cron (`run-watches`)** | When evaluating due watches | **Yes** — before or instead of blind recheck on exhausted plans |
| **Plan activation / refresh** | If needed after create | **Yes** — when activation path should reconcile lifecycle |
| **`loadPlanSummaries`** | Read `prefs.lifecycleStatus` from row | **No** — summaries reflect last persisted state |

**Do not call write orchestrator from:** ranking, strategy discovery, GF8, generic plan detail reads, UI components.

---

### Read-only display without persist

For callers that need resolved lifecycle view but must not write (e.g. plan detail history, tests):

```typescript
const plan = await loadPlan(client, userId, planId);
const lifecycle = resolvePlanLifecycle(plan, now);
return applyLifecycleView(plan, lifecycle);
// primaryOptionId in view reflects resolved currentOptionId for display
// DB unchanged — may be stale until a write orchestrator runs elsewhere
```

Home current-plan path should **always persist first** so the traveler sees truth that matches DB.

---

### Home current-plan query

**Today:** client `pickCurrentPlan` on `PlanSummary[]` by calendar date only.

**Fix (preferred):**

Add server fn e.g. `getCurrentPlanForHome`:

```typescript
// For each candidate summary (or load + resolveAndPersist on soonest dates):
await resolveAndPersistPlanLifecycle({ client, userId, planId, now });
// Then pick among summaries where lifecycleStatus !== "complete" && isActionable
return pickActionablePlan(summaries, now);
```

Expose via `getCurrentPlan` server fn; Home calls that instead of client-only date filter.

Enrich `PlanSummary` with:

```typescript
lifecycleStatus: "active" | "complete"
isActionable: boolean  // derived from persisted state + option timestamps, or post-persist
```

**Invariant after fix:**

```text
Home current Plan = actionable Plan (lifecycleStatus active + future usable option)
≠ most recently created Plan regardless of state
≠ calendar today alone
```

For multiple active plans: keep existing ordering (soonest date, then newest created) among **actionable-only** candidates.

---

### Monitoring impact — watch recheck order (locked)

**Do not** merely replace hardcoded `primaryStillCurrent: true` with:

```typescript
actionableOptionIds.includes(primaryId)
```

Lifecycle resolution must run **first** in `recheckWatch`:

```text
watch recheck starts
        ↓
resolveAndPersistPlanLifecycle()
        ↓
primary passed?
   yes → advance primary (setPrimaryOption path)
        → sync watch anchor to new current option
        ↓
reload plan / anchor option
        ↓
continue signal evaluation against NEW current option
        ↓
decideWatchOutcome(..., { primaryStillCurrent: true })  // now meaningful — primary is current
```

Otherwise the watch system reacts to the **old** departed flight (missing / departed signals) even though the Plan has legitimately advanced.

| Event | Watch behavior |
|-------|----------------|
| Primary advances to next option | Update `watch_plans.plan_option_id` via `setPrimaryOption` path **before** gatherWatchSignals |
| Plan completes | End active watch (`state: ended`, `ended_at`) — skip further recheck |
| One flight expires, others remain | **Keep watching** on new anchor after advance |
| Plan complete | Cron should not treat as actionable |

**Do not:** create duplicate watches on advance (`beginWatch` already dedupes).

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
loadPlan(planId) still returns plan (read only, no side effects)
lifecycleStatus: complete (from prefs)
travelDate unchanged (still today if completed mid-day)
options preserved for history
resolveAndPersistPlanLifecycle is no-op when already complete
```

### Test 6 — Multiple plans (Home selection)

```text
Plan A: today, all passed → persisted complete, not actionable
Plan B: tomorrow, actionable

getCurrentPlanForHome → Plan B (not Plan A)
```

### Test 7 — Ineligible option not promoted

```text
rank 2 ineligible, rank 3 eligible future
→ advance to rank 3, skip rank 2
```

### Test 8 — loadPlan does not mutate

```text
Call loadPlan twice with passed primary, no write orchestrator between calls
→ primary_option_id unchanged in DB
→ applyLifecycleView may show resolved current for display only
```

### Test 9 — Watch recheck order

```text
Primary departed, rank 2 future exists
recheckWatch runs resolveAndPersistPlanLifecycle first
→ primary advanced before gatherWatchSignals
→ signals evaluated against new anchor, not departed flight
```

---

## Part 5 — Acceptance Criteria

- [ ] Passed flight cannot remain persistent active recommendation (after persist orchestrator runs)
- [ ] Plan auto-advances to highest-ranked usable future option (by existing `rank`)
- [ ] Plan completes when no usable future options remain (`lifecycleStatus: complete`, `travelDate` unchanged)
- [ ] Completed plans excluded from Home active/current plan query
- [ ] Completed same-day plans are **not** forced into calendar “past” semantics on backend
- [ ] Completed plans remain retrievable via `loadPlan` (read only)
- [ ] **`loadPlan()` never writes** — no accidental mutation on read/refetch
- [ ] All lifecycle writes go through `resolveAndPersistPlanLifecycle()`
- [ ] Watch recheck: resolve + persist **before** signal evaluation; anchor synced on advance
- [ ] Watch ends when plan completes; continues when plan advances to next option
- [ ] Existing ranking reused — no second ranking system
- [ ] No Strategy/discovery architecture changes
- [ ] `bunx tsc --noEmit` passes
- [ ] Focused lifecycle tests pass
- [ ] No Home UI changes in this task

---

## Part 6 — Implementation Checklist

### Core (pure)

- [ ] Create `src/lib/aircue/plan-lifecycle.server.ts`
- [ ] `isOptionActionable()` — UTC dep + eligibility
- [ ] `resolvePlanLifecycle()` — pure advance / complete logic
- [ ] `applyLifecycleView()` — read-only enriched StandbyPlan
- [ ] `pickActionablePlan()` for Home selection

### Write orchestrator

- [ ] `resolveAndPersistPlanLifecycle()` — load → resolve → persist → reload
- [ ] `persistLifecycleMutations()` — primary via `setPrimaryOption`, prefs lifecycle, end watch
- [ ] `prefs.lifecycleStatus` + `lifecycleResolvedAt` on complete

### Integration (writes only via orchestrator)

- [ ] **`loadPlan` stays read-only** — optional `applyLifecycleView` only when caller opts in, never persist
- [ ] New `getCurrentPlanForHome` (or equivalent) — **calls write orchestrator**
- [ ] Enrich `PlanSummary` with `lifecycleStatus`, `isActionable`
- [ ] **`recheckWatch`:** `resolveAndPersistPlanLifecycle` **first**, then signals on new anchor
- [ ] **Watch cron:** resolve + persist on due watches; end recheck when complete
- [ ] Plan activation path: orchestrator where appropriate

### Tests

- [ ] `plan-lifecycle.test.ts` — tests 1–9 above
- [ ] `loadPlan` idempotence / no-write test
- [ ] Optional integration test in `recheck-watch.test.ts` for advance-before-signals order

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

Where `resolvePlanLifecycle` (pure) and `resolveAndPersistPlanLifecycle` (writes) live and when each runs.

### Advance Behavior

How next option is chosen (rank order, actionable filter). Writes only via orchestrator.

### Completion Behavior

When plan becomes `complete`, `travelDate` preserved, watch ended. Not conflated with calendar past.

### Home Query

How completed plans excluded (`lifecycleStatus`, not date hack). Home path calls write orchestrator.

### Monitoring Impact

Recheck order: persist lifecycle → advance anchor → then signals. Not `primaryStillCurrent` band-aid alone.

### Tests

List tests + pass/fail.

### Typecheck

Result.

### Existing Failures

Separate unrelated pre-existing failures (e.g. `decideWatchOutcome` watch-signals tests).

---

## One-page summary

**Bug:** `primary_option_id` is set once and never advanced. Home selects by calendar date. UI shows “Departure time has passed” with no server lifecycle transition.

**Fix:** Pure `resolvePlanLifecycle()` + explicit `resolveAndPersistPlanLifecycle()` write orchestrator. **`loadPlan()` stays read-only.** Persist from Home current-plan request, watch recheck (before signals), watch cron, and activation — advance to next ranked actionable option when current passes; mark `lifecycleStatus: complete` when none remain (without rewriting `travelDate`); exclude completed plans from Home; sync watch anchor on advance, end watch on complete.

**Then:** Stop backend lifecycle work. Home UI changes come later against stable orchestrated reads.
