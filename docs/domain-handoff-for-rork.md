# Domain Handoff — Standbye → New Rork Repo

**Who this is for:** a new Cursor chat that can see the Rork repo but not this one.  
**Paste this whole file** (and optionally drop in `plan-lifecycle.portable.ts`) at the start of that chat.

**Source of truth in old repo:** `src/lib/aircue/plan-lifecycle.server.ts` (wired to Supabase).  
**Portable copy (no deps):** `docs/handoff/plan-lifecycle.portable.ts` ← **copy this file into the new repo.**

---

## 1. What you’re bringing (and what you’re not)

### Bring (proven domain)

| Piece | Role | Portability |
|-------|------|-------------|
| **Plan lifecycle** | Advance current flight / mark Plan Done | ✅ Pure — portable file ready |
| **Connection viability** | Shared detour rules for connections | ✅ Mostly pure (geo helper optional) |
| **Plan / Flight mental model** | One Plan per route+day | ✅ Spec below |

### Do not bring yet

- Old React routes / PlanSnapshot / Updates tab UI
- Full `plan.server.ts` (Supabase orchestration blob)
- Ranking providers / AeroDataBox / GF8 (mock data in Rork first)
- Escape as a parallel product
- Lovable layout chrome

**Rule:** New repo owns UI + local state first. Lifecycle pure functions drop in immediately. Persistence adapters come second.

---

## 2. Traveler language map

| New UI / Rork | Old repo field | Meaning |
|---------------|----------------|---------|
| Plan | `StandbyPlan` / `plans` row | One origin→dest→day |
| Current flight | `primaryOptionId` | What Home shows |
| Other ways | `options[]` ranked | Still-open alternatives |
| Watching | `watch_plans.state=active` | Monitoring on |
| Done | `prefs.lifecycleStatus=complete` | No usable flights left |
| Past | `travelDate < today` | Calendar only — **not** Done |

Never show travelers: primary, preferred, option, watch object, strategy, escape.

---

## 3. Product rules (must not regress)

```text
current flight still future     → keep it
current flight departed
  + another eligible future     → advance to lowest rank still open (NO re-rank)
current flight departed
  + nothing left                → Plan status = complete; end watching
complete same calendar day      → travelDate UNCHANGED; UI: Today → Done
```

```text
loadPlan / loadPlanDetail  = READ ONLY
resolvePlanLifecycle       = PURE decision
resolveAndPersist…         = ONLY place that writes current / Done / end watch
```

Watch / monitoring order (critical):

```text
recheck starts
  → resolveAndPersistPlanLifecycle()
  → advance current + sync watch anchor if needed
  → THEN evaluate signals against the NEW current flight
```

If you evaluate signals before advance, the system reacts to a departed flight the Plan already left behind.

---

## 4. Files to copy into the new repo

1. Copy  
   `docs/handoff/plan-lifecycle.portable.ts`  
   → e.g. `src/domain/plan-lifecycle.ts`

2. Keep this handoff markdown in the new repo as  
   `docs/domain-handoff.md`  
   so Cursor there has the contract.

3. (Optional later) Port viability from old  
   `src/lib/aircue/connection-viability.server.ts`  
   — pure parts only: `evaluateConnectionViability`, ceilings, caveat helpers.  
   Skip `detourRatioForPath` until you have airport geo in the new app.

---

## 5. Function catalog (lifecycle)

All of these are in the portable file. Names use traveler-friendly “flight/current” instead of legacy “option/primary”.

| Function | Pure? | What it does |
|----------|-------|--------------|
| `isFlightDeparted(flight, now)` | ✅ | `schedDepUtc <= now` |
| `isFlightActionable(flight, now)` | ✅ | Not ineligible, has UTC, not departed |
| `actionableFlights(flights, now)` | ✅ | Actionable sorted by `rank` asc |
| `nextActionableFlight(...)` | ✅ | Next after a departed current |
| `resolvePlanLifecycle(plan, now)` | ✅ | **The** decision: active/complete + advance |
| `applyLifecycleView(plan, result)` | ✅ | Display overlay; **not** a DB write |
| `localTodayISO(now)` | ✅ | Device-local YYYY-MM-DD |
| `pickActionablePlan(summaries, today)` | ✅ | Home selection among non-Done |

### `resolvePlanLifecycle` result

```ts
{
  status: "active" | "complete"
  currentFlightId: string | null
  currentAdvanced: boolean          // ⇒ persist new current
  newCurrentFlightId: string | null
  shouldEndWatch: boolean           // ⇒ stop monitoring
  actionableFlightIds: string[]
}
```

### Write orchestrator (you implement in new repo)

```ts
async function resolveAndPersistPlanLifecycle({ planId, now }) {
  const plan = await loadPlan(planId);              // READ ONLY
  const lifecycle = resolvePlanLifecycle(plan, now);

  if (!lifecycle.currentAdvanced && lifecycle.status !== "complete") {
    return { plan: applyLifecycleView(plan, lifecycle), lifecycle, persisted: false };
  }
  if (plan.lifecycleStatus === "complete" && lifecycle.status === "complete") {
    return { plan: applyLifecycleView(plan, lifecycle), lifecycle, persisted: false };
  }

  if (lifecycle.currentAdvanced && lifecycle.newCurrentFlightId) {
    await setCurrentFlight(planId, lifecycle.newCurrentFlightId);
    // If watching: point monitor at the same flight id
  }
  if (lifecycle.status === "complete") {
    await saveLifecycleStatus(planId, "complete", now);
    await endWatch(planId);
  }

  const refreshed = await loadPlan(planId);
  return {
    plan: applyLifecycleView(refreshed, resolvePlanLifecycle(refreshed, now)),
    lifecycle,
    persisted: true,
  };
}
```

**Call write orchestrator from:** Home current load, watch recheck (first), after Build/activate.  
**Do not call from:** Past/Done history reads, list-only browses that shouldn’t mutate.

---

## 6. Map portable types ↔ Rork prompt types

From the Rork Stage-1 prompt:

```text
Plan.currentFlightId  ↔  LifecyclePlan.currentFlightId
Plan.status           ↔  LifecyclePlan.lifecycleStatus
Flight.rank           ↔  LifecycleFlight.rank
Flight.schedDepUtc    ↔  LifecycleFlight.schedDepUtc
Flight.state           ↔  derive: current | open | passed
                         (passed = departed OR not actionable;
                          current = lifecycle.currentFlightId;
                          open = actionable and not current)
```

Adapter sketch:

```ts
function toLifecyclePlan(plan: AppPlan): LifecyclePlan {
  return {
    id: plan.id,
    travelDate: plan.travelDate,
    currentFlightId: plan.currentFlightId,
    lifecycleStatus: plan.status,
    flights: plan.flights.map((f) => ({
      id: f.id,
      rank: f.rank,
      schedDepUtc: f.schedDepUtc,
      staffEligibility: f.eligible === false ? "ineligible" : "eligible",
    })),
  };
}
```

---

## 7. Connection viability (optional second port)

**Old file:** `src/lib/aircue/connection-viability.server.ts`

| Export | Notes |
|--------|-------|
| `THIN_NETWORK_THRESHOLD = 5` | Broad vs thin network |
| `DETOUR_CEILING_BROAD = 1.45` | Normal mode, broad |
| `DETOUR_CEILING_THIN = 2.0` | Thin network / escape-ish |
| `evaluateConnectionViability(input)` | Single policy for discovery + option admission |
| `detourCeilingForNetwork({ mode, networkBreadth })` | Ceiling picker |
| `caveatFromDetourRatio` / `viabilityCaveatText` | UI copy hints |

**Invariant:** `networkBreadth` is counted **before** detour filtering.  
One viability function for both “strategies/paths” and “flights on the plan.”

Port when Ways gets real connection paths — not needed for mock Home.

---

## 8. Old-repo function index (if you open that tree later)

### Lifecycle (clean — prefer portable file)

`src/lib/aircue/plan-lifecycle.server.ts`

- Pure: `resolvePlanLifecycle`, `isOptionActionable`, `applyLifecycleView`, `pickActionablePlan`, …
- Write: `resolveAndPersistPlanLifecycle`, `getCurrentPlanForHome` (Supabase-coupled)

### Plan server (noisy — do not wholesale copy)

`src/lib/aircue/plan.server.ts` — pick only if you need behavior reference:

| Function | Intent |
|----------|--------|
| `loadPlan` | READ ONLY load |
| `buildPlan` | Create + rank (heavy) |
| `setPrimaryOption` | Set current + sync watch anchor |
| `beginWatch` / `endWatch` | Monitoring |
| `recheckWatch` | Must call lifecycle **first** |
| `attachLoad` | Reported seats/standbys |

### UI vocabulary target (new app)

See `docs/ui-wireframe-function-map.md` and `docs/rork-prompt-standbye.md` in the old repo if you still have them — or restate: Home = Current Plan; Ways / Load / Activity are Plan-scoped; tabs = Home · Plans · You.

---

## 9. Prompt for the new Cursor chat (paste after this doc)

```text
You are working in the new Standbye Rork repo.

I am pasting a domain handoff from the old backend repo.
1. Add docs/handoff/plan-lifecycle.portable.ts into src/domain/plan-lifecycle.ts
   (or I will drop the file — use whatever path fits this project).
2. Do not reimplement advance/complete logic — import resolvePlanLifecycle.
3. Wire PlanContext so that:
   - After CREATE_PLAN / Build, set currentFlightId to rank-1 open flight, watching=true
   - On Home focus / app foreground, run resolvePlanLifecycle (and persist if currentAdvanced or complete)
   - Derive Flight.state: current | open | passed from lifecycle + schedDepUtc
   - pickActionablePlan drives which Plan Home shows
4. Keep travelDate unchanged when status becomes complete
5. Do not add an Updates tab or Escape mode
6. List every file you change

Domain rules and function catalog are in docs/domain-handoff.md (this file).
```

---

## 10. Quick tests the new repo should keep

| Case | now vs deps | Expect |
|------|-------------|--------|
| Current 08:15, next 10:30, now 08:49 | advance | `currentAdvanced`, new = 10:30 flight |
| Deps 08:00, 08:30, 11:00, 13:00; now 10:00 | skip | current → 11:00 |
| All departed | complete | `status=complete`, `shouldEndWatch` |
| Current still future | no-op | `currentAdvanced=false` |
| Next ineligible, later eligible | skip | advance past ineligible |
| Already complete | no-op | stay complete, no advance |
| Home: today Done + tomorrow active | pick | tomorrow’s plan |

---

## 11. One-line summary for the other agent

**Port `resolvePlanLifecycle` (pure). Implement a thin write orchestrator. Home and watch call the orchestrator; history only reads. Done ≠ Past. Never mutate inside a generic load.**
