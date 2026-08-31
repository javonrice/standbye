# Domain Handoff — Standbye → New Rork Repo

**Who this is for:** a new Cursor chat that can see the Rork repo but not this one.  
**Paste this whole file** (and optionally drop in `plan-lifecycle.portable.ts`) at the start of that chat.

**Source of truth in old repo:** `src/lib/aircue/plan-lifecycle.server.ts` (wired to Supabase).  
**Portable copy (no deps):** `docs/handoff/plan-lifecycle.portable.ts` ← **copy this file into the new repo.**

---

## 1. What you’re bringing (and what you’re not)

### Bring (proven domain — these are product invariants)

| Piece | Role | Why it matters | Portability |
|-------|------|----------------|-------------|
| **Plan lifecycle** | Advance current / mark Done | Correctness of Home | ✅ Portable TS ready |
| **Cheap watch / call gating** | `skip` \| `notify-only` \| `rerank` | **Call cost** — quiet cycles must not burn GF8/ADB | Spec + gate logic |
| **Every Way There** | Paths (`strategies[]`) via board intersection | Breadth without hub heuristics | Spec + viability |
| **Connection viability** | One detour policy for paths + options | Consistency + cost of discovery | ✅ Mostly pure |
| **Loads** | Segment-keyed evidence; personal wins, network fills | Simplicity for traveler; **zero provider calls** on attach | Spec + adjust helpers |
| **Plan mental model** | One Plan per route+day | UI structure | ✅ Spec |

### Do not bring yet (UI / heavy providers)

- Old React routes / PlanSnapshot / Updates tab UI
- Full `plan.server.ts` blob (use as reference only)
- Live AeroDataBox / GF8 wiring on day one (mock boards/options first)
- Escape as a parallel product mode
- Lovable layout chrome

**Rule:** New repo can mock providers, but must **not** reinvent the cost/simplicity invariants below. When real APIs return, keep the same gates.

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

## 7. Call economics — cheap watch (imperative)

**Problem we solved:** quiet 30‑minute watch cycles were burning paid AeroDataBox / Google Flights even when nothing changed. Unit economics failed (quiet watches ≪ 100× paid calls was the goal).

**Design intent:** change **when** we spend money — not what we know. Free/shared signals first; paid rank only when the Plan needs reassessment.

### Three outcomes (not two)

Every monitoring cycle ends in exactly one of:

| Outcome | Meaning | Paid work |
|---------|---------|-----------|
| **`skip`** | Nothing notify- or rerank-worthy; safety refresh not due | No `rankStandbyOptions`, no GF8, no forced operator verify; reuse fresh caches |
| **`notify-only`** | Traveler-useful update that does **not** change ranking inputs (e.g. gate) | May write an activity event; **no** rank / GF8 / forced verify |
| **`rerank`** | Plan needs reassessment | Run ranking (GF8 inside ranking as today) **for this Plan only**; verify only if eligibility/identity requires it |

### Cycle order (locked)

```text
1. resolveAndPersistPlanLifecycle()   ← advance/complete FIRST
2. gather cheap signals               ← status / FIDS / env fingerprints (cached)
3. decideWatchOutcome(prev, next)     ← skip | notify-only | rerank
4. if rerank → rankStandbyOptions
   else → update snapshot / maybe notify; DO NOT call GF8
```

### Cost rules that must survive a rewrite

| Rule | Why |
|------|-----|
| Never `force: true` on every status/FIDS fetch | Force bypasses cache → burns ADB units every cycle |
| Shared FIDS cache keyed by **airport + date + window** | Many watches share one board download |
| Safety refresh is distance-aware (not “always rerank”) | Far-out Plans don’t need paid reassess every tick |
| Operator verify is lazy (current flight / eligibility), not verify-all | Expensive; once per identity change |
| Quiet cycle success metric | Paid calls ≈ 0 when signals unchanged |

### Old-repo anchors

| File | Role |
|------|------|
| `watch-signal-gate.ts` → `decideWatchOutcome` | Pure gate: skip / notify-only / rerank |
| `watch-signals.server.ts` → `gatherWatchSignals` | Cheap signal gather + metrics |
| `plan.server.ts` → `recheckWatch` | Orchestrates lifecycle → gather → decide → maybe rank |
| `aerodatabox.server.ts` → `cachedCall` | Cache/TTL/budget — never treat Watch as auto-force |
| Docs: `docs/cheap-watch-redesign.md` | Full design |

### New-repo guidance

- Mock monitoring can fake `skip` most of the time.
- When you wire real providers, **port the three-outcome gate first** — do not reintroduce “always rerank.”
- Log `outcome` on every cycle so cost regressions are visible.

---

## 8. Every Way There — paths, not hubs (imperative)

**Product question:** What realistic **airport paths** get me from origin to destination?

A path is an ordered airport list — **not** a flight number:

```text
IAH → ORD
IAH → OKC → ORD
IAH → DEN → ORD
```

One path = one **Strategy** (many flights can sit on the same path).

### UI gate (simple)

```text
Show “Every Way There” / Ways paths  iff  strategies.length > 1
```

Multiple flights on the **same** path do **not** count as multiple ways.

### Discovery architecture (board intersection)

**Do not** invent hubs / focus cities / “clever prune to top 8 by frequency.” That hid real paths (canonical bug: IAH→OKC→ORD dropped because OKC ranked ~16th by departure count).

Locked approach:

```text
1. Load origin departure board + destination arrival board (shared network snapshot)
2. Intersect on intermediate station X: O→X and X→D both exist that day
3. Compute networkBreadth = distinct viable X BEFORE detour filter
4. Apply ONE viability policy (detour ceiling by breadth + mode)
5. Emit plan.strategies[] = surviving paths (broader than deep-scored options)
6. Deep-score / GF8 only a subset → plan.options[] (flights)
```

### Path ⊂ options invariant (locked)

```text
plan.options connection paths  ⊆  plan.strategies paths     ✅ always
plan.strategies paths          ⊆  plan.options paths        ❌ never required
```

Strategies are the **search space**. Options are **ranked flights inside** that space.  
Never: Strategy says NO to a path while options still recommend flights on that path.

### Connection viability (one policy)

**File:** `src/lib/aircue/connection-viability.server.ts`

| Constant / fn | Role |
|---------------|------|
| `THIN_NETWORK_THRESHOLD = 5` | Broad vs thin |
| `DETOUR_CEILING_BROAD = 1.45` | Normal + broad network |
| `DETOUR_CEILING_THIN = 2.0` | Thin network |
| `evaluateConnectionViability(input)` | Shared by discovery **and** option admission |
| `computeNetworkBreadth` | Count X **before** detour filtering |

Modes: `normal` | `wide` | `escape` | `expert` (expert = no ceiling).

### Every Way There vs Find Another Way

| | Every Way There | Find Another Way |
|--|-----------------|------------------|
| Scope | Paths **inside** current Plan search | Wider when Plan isn’t good enough |
| Traveler language | Ways / paths on this Plan | Later — do **not** ship as “Escape” product mode in v1 UI |
| Shared model | Both use `plan.strategies[]` path objects | Same |

### Old-repo anchors

| File | Role |
|------|------|
| `strategy-discovery.server.ts` | Board intersection discovery |
| `network-snapshot.server.ts` | Shared dep + arr boards |
| `plan-strategy.ts` | Strategy types, attach options to paths, option-derived evidence |
| `connection-viability.server.ts` | Shared detour policy |
| Docs: `every-way-there-restructure-plan.md`, `connection-viability-fix-plan.md` | Full plans |

### New-repo guidance

- Mock: hardcode 2–3 strategies (nonstop + one via) so Ways UI works.
- When real discovery lands: intersection + shared viability **before** any hub list.
- Option-derived strategies must carry truthful connection evidence counts (not inflated).

---

## 9. Loads — simple for traveler, careful for cost (imperative)

**Philosophy:** Traveler gives Standbye what only they can see (seats / standbys). Standbye automates everything else. Backend can be sophisticated; UX stays almost stupidly simple.

### Two layers

| Layer | What | Provider cost |
|-------|------|---------------|
| **Personal reported load** | Traveler typed or screenshot-parsed for their Plan | Vision parse on upload only; **attach/rescore = $0 GF8/ADB** |
| **Network snapshot** (optional reuse) | Normalized flight-level load others can consume | No credits / no request queue — side effect of upload |

**Merge rule:** personal wins; network fills gaps only.  
`loadsForSegments` → `Map<segmentKey, ReportedLoad>`.

### Identity: segment keys, not flight labels

```text
Segment key:  CARRIERNUM:ORIG-DEST:YYYY-MM-DDTHH:MM
Example:      UA881:ORD-HND:2026-10-15T17:00
```

Never join loads across itineraries because `flight_label` matches.  
Connection itinerary load state = **worst** segment among legs.

### What happens on “Add what I see”

```text
1. Save reported_loads (segment_key + seats/standbys/cabin)
2. Locally rescore + resort existing plan options
3. Update judgments / rank order in DB
4. DO NOT call rankStandbyOptions / GF8 / ADB for this path
5. DO NOT auto-change currentFlightId when rank #1 changes
   (current stays until lifecycle advance or traveler switches)
```

That zero-provider-call rescore is a **cost invariant**. Breaking it makes every load upload expensive.

### Screenshot path (when wired)

| Decision | Locked choice |
|----------|---------------|
| Vision MVP | Gemini Flash structured JSON (not Lovable-coupled) |
| Raw image | Memory/temp only — discard after parse |
| Airline interpreter MVP | United-first; interfaces airline-neutral |
| Contribution vs consumption | Contributor home airline must match flight airline to **publish** snapshot; any eligible traveler may **consume** |
| Manual entry | First-class — plan-level multi-row, not screenshot-only |

### Old-repo anchors

| File | Role |
|------|------|
| `load-adjust.ts` | Judgment/confidence from load (pure-ish) |
| `plan-load-resort.ts` / `rescoreAndResortPlanOptions` | Local resort, no providers |
| `attachLoad` in `plan.server.ts` | Persist + rescore entry |
| `load-screenshot/*` | Parse pipeline + snapshots |
| Docs: `load-aware-ranking.md`, `shared-load-snapshots-architecture.md` | Full plans |

### New-repo guidance

- Stage 1: manual seats/standbys on current flight → update mock judgment locally.
- Preserve: **no network ranking calls on load save**.
- Shared snapshots / Gemini: later; keep parser behind an interface.

---

## 10. Old-repo function index (reference)

### Lifecycle (clean — prefer portable file)

`src/lib/aircue/plan-lifecycle.server.ts`

- Pure: `resolvePlanLifecycle`, `isOptionActionable`, `applyLifecycleView`, `pickActionablePlan`, …
- Write: `resolveAndPersistPlanLifecycle`, `getCurrentPlanForHome` (Supabase-coupled)

### Calls / watch

| Function | Intent |
|----------|--------|
| `decideWatchOutcome` | skip \| notify-only \| rerank |
| `gatherWatchSignals` | Cheap signals + cache metrics |
| `recheckWatch` | Lifecycle first, then gate, then maybe rank |

### Every Way There

| Function | Intent |
|----------|--------|
| `discoverConnectionGatewaysFromSnapshot` | Board intersection |
| `computeNetworkBreadth` | Pre-detour breadth |
| `evaluateConnectionViability` | Shared path/option policy |
| `buildStoredStrategies` / `attachOptionsToStrategies` | Persist + attach flights to paths |

### Loads

| Function | Intent |
|----------|--------|
| `attachLoad` | Save + local rescore (**no GF8**) |
| `judgeWithLoad` / `loadPillar` | Judgment from seats/standbys |
| `loadsForSegments` | Personal ∪ network merge |

### Plan server (noisy — reference only)

| Function | Intent |
|----------|--------|
| `loadPlan` | READ ONLY |
| `buildPlan` | Create + rank (heavy / paid) |
| `setPrimaryOption` | Set current + sync watch anchor |
| `beginWatch` / `endWatch` | Monitoring |

### UI vocabulary target

Home = Current Plan; Ways / Load / Activity are Plan-scoped; tabs = Home · Plans · You.  
See also `docs/ui-wireframe-function-map.md`, `docs/rork-prompt-standbye.md`.

---

## 11. Prompt for the new Cursor chat (paste after this doc)

```text
You are working in the new Standbye Rork repo.

I am pasting a domain handoff from the old backend repo.
1. Add plan-lifecycle.portable.ts into src/domain/plan-lifecycle.ts
2. Do not reimplement advance/complete — import resolvePlanLifecycle
3. Wire PlanContext:
   - After Build: currentFlightId = rank-1 open, watching=true
   - Home focus: resolve lifecycle; persist advance/complete
   - Derive Flight.state current|open|passed
   - pickActionablePlan for Home
4. Invariants you must NOT break when adding features later:
   - Watch cycles: skip | notify-only | rerank — never always-rerank / always-force providers
   - Lifecycle BEFORE watch signals
   - Every Way There = airport paths (strategies); options ⊆ strategy paths
   - One viability policy for paths and connection options; networkBreadth before detour
   - Load attach = local rescore only — zero GF8/ADB on save; do not auto-switch current on rank change
5. Keep travelDate when complete; Done ≠ Past
6. No Updates tab; no Escape product mode
7. List every file you change

Full rules: docs/domain-handoff-for-rork.md
```

---

## 12. Quick tests the new repo should keep

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

## 13. Invariant checklist (cost + simplicity + correctness)

Before shipping any “smart” backend hookup in the new repo, confirm:

- [ ] Quiet watch → `skip` (no GF8, no forced ADB)
- [ ] Notify-worthy non-rank change → `notify-only` (still no GF8)
- [ ] Lifecycle advance/complete runs before signal evaluation
- [ ] Strategies discovered by board intersection, not hub shortlists
- [ ] `options` connection paths ⊆ `strategies` paths
- [ ] Same `evaluateConnectionViability` for discovery and option admission
- [ ] `networkBreadth` computed before detour filter
- [ ] Load save rescores locally with **zero** provider calls
- [ ] Load does not auto-change current flight
- [ ] Loads keyed by `segment_key`, not flight label
- [ ] Done keeps `travelDate`; Past is calendar-only
- [ ] `loadPlan` / detail reads never write lifecycle

---

## 14. One-line summary for the other agent

**Port pure lifecycle. Gate paid calls (`skip` / `notify-only` / `rerank`). Discover Ways by board intersection + one viability policy. Loads are segment-keyed local evidence with zero GF8 on attach. Done ≠ Past. Never mutate inside a generic read.**
