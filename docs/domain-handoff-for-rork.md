# Domain Handoff — Standbye → New Rork Repo

**Who this is for:** a new Cursor chat that can see the Rork repo but not this one.  
**Paste into that chat:**
1. This file (`docs/domain-handoff-for-rork.md`) — domain + **screen hierarchy** (§20)
2. `docs/handoff/plan-lifecycle.portable.ts` — drop-in lifecycle
3. Prefer also pasting `docs/ui-wireframe-function-map.md` for full ASCII wireframes  
4. Prefer also pasting `docs/rork-prompt-standbye.md` Stage 1 if starting a Rork Plan Mode build

**Source of truth in old repo:** `src/lib/aircue/plan-lifecycle.server.ts` (wired to Supabase).  
**Portable copy (no deps):** `docs/handoff/plan-lifecycle.portable.ts` ← **copy this file into the new repo.**

---

## 1. What you’re bringing (and what you’re not)

### Bring (proven domain — these are product invariants)

| Piece | Role | Why it matters | Portability |
|-------|------|----------------|-------------|
| **Plan lifecycle** | Advance current / mark Done | Correctness of Home | ✅ Portable TS ready |
| **Plan ranking / scoring** | Pillars → score → judgment | What “Favorable / Mixed / Riskier” means | Spec + `option-scoring` / `access-scoring` |
| **Travel access + eligibility** | home/zed/other; operator verify | Who can list; never invent access | Spec + pure helpers |
| **Identity keys** | `option_key` / `segment_key` | Sync, loads, dedupe | ✅ Small pure module |
| **Coverage** | available / not_covered / unavailable | Missing data ≠ “good” | Spec |
| **Cheap watch / call gating** | `skip` \| `notify-only` \| `rerank` | **Call cost** | Spec + gate logic |
| **Flight presence / cancel** | Status transitions only | No fake cancels from ranking gaps | Spec + pure helpers |
| **Every Way There** | Paths via board intersection | Breadth without hub heuristics | Spec + viability |
| **Connection viability** | One detour policy | Consistency + discovery cost | ✅ Mostly pure |
| **Loads** | Segment-keyed; local rescore | Simplicity; **$0 providers on attach** | Spec + scoring shared |
| **Plan mental model** | One Plan per route+day | UI structure | ✅ Spec |

### Do not bring yet (UI / heavy providers)

- Old React routes / PlanSnapshot / Updates tab UI
- Full `plan.server.ts` / `ranking.server.ts` provider orchestration (use as reference)
- Live AeroDataBox / GF8 on day one (mock boards/options first)
- Escape as a parallel product mode
- Lovable layout chrome

**Rule:** New repo can mock providers, but must **not** reinvent the cost/simplicity/scoring invariants below. When real APIs return, keep the same gates and weights.

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

3. When implementing real scoring (not mocks), also copy these pure modules:
   - `option-key.ts`
   - `access-scoring.ts`
   - `option-scoring.ts`
   - `staff-eligibility.ts`
   - `load-evidence.ts`
   - `coverage.ts`
   - `watch-signal-gate.ts`
   - `connection-viability.server.ts` (geo optional)

4. (Later) Port discovery/watch orchestration from old servers once providers exist.

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
| Docs: `cheap-watch-redesign.md` | Full design |
| **`docs/flight-evidence-watch-signals-handoff.md`** | **Per-flight evidence (FAA/weather/holiday/ADB) + watch use** |

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
| **`docs/load-ideology-handoff.md`** | **Who enters / who sees / contribution vs consumption (paste-ready)** |

### New-repo guidance

- Stage 1: manual seats/standbys on current flight → update mock judgment locally.
- Preserve: **no network ranking calls on load save**.
- Shared snapshots / Gemini: later; keep parser behind an interface.
- Use the **same** `scoreFromPillars` / `judgmentFromScore` as full ranking (see §10) — do not invent a second scorer for loads.

---

## 10. Plan ranking / scoring (imperative)

**What the traveler sees:** judgment label + pillars + plain reasons — **never** a boarding probability or clearance %.

**Internal:** deterministic score 0–100 → judgment. Same weights for:
- Initial Plan build (`ranking.server.ts`)
- Load-driven local resort (`option-scoring.ts` / `plan-load-resort`)

Do **not** fork two scoring systems.

### Four pillars

| Key | Weight in score | Meaning |
|-----|-----------------|---------|
| `availability` | × **1.2** | Public booking board / load cushion |
| `operations` | × **1.0** | FAA/weather/cancel pressure |
| `recovery` | × **0.8** | Later ways if this one fails |
| `history` | × **0.4** | Historical load/cancel patterns |

Pillar states: `good` | `fair` | `poor` | `unknown`

State points (before weights):

```text
good=30  fair=16  poor=0  unknown=18
```

**Important:** `unknown` scores mid (18), not 0 — absence is not a penalty and not a reward. Coverage UI must still say “not covered / unavailable” honestly (see §13).

### Score formula (locked)

```text
raw = avail*1.2 + ops*1.0 + recovery*0.8 + history*0.4
      (+ avail term may be × loadMultiplier when a complete load exists)
base = round((raw / (30 * 3.4)) * 100)     // normalize to ~0–100
score = applyAccessAwareScore(base, access, standbyClears)
```

### Access + clears friction (soft only)

**File:** `access-scoring.ts`

| Access | Friction |
|--------|----------|
| `home` | 0 |
| `zed` | −6 |
| `other` | −12 |
| unknown | −3 |

| Standby clears (segments) | Friction |
|---------------------------|----------|
| 1 (nonstop) | 0 |
| 2 | −12 |
| 3 | −24 |
| … | −(clears−1)×12 |

**Never** hard-sort `home > zed > other`. A strong ZED nonstop can beat a weak home connection. Access is friction on the score, not a separate rank key.

Itinerary access = **worst** segment access (`worstAccess`).

### Judgment thresholds

**File:** `option-scoring.ts` → `judgmentFromScore` (prefer this over older `judgeScore` in ranking)

```text
availability poor AND recovery poor  → riskier
availability poor                     → mixed if score≥76 else riskier
score ≥ 76                            → favorable
score ≥ 52                            → mixed
else                                  → riskier
```

### Confidence

Haircut when operator still `uncertain` or many pillars `unknown`.  
Complete personal load + eligible + few unknowns → can be `high`.  
**Unverified ≠ ineligible.**

### Connection scoring notes

- Connections must pass **shared viability** first (same as strategies).
- Score uses worst-leg availability when loads exist; `standbyClears` = segment count.
- Cancel pressure on earlier same-route deps can push operations to `poor` / `fair`.

### Non-goals (do not reintroduce)

- Boarding probability / “% chance you clear”
- Silent change of current flight when rank #1 flips after rescore
- Treating missing BTS/FAA history as “Normal / good”
- United-only hardcodes in the scorer (access is airline-general)

### Old-repo anchors

| File | Role |
|------|------|
| `option-scoring.ts` | **Canonical** score / judgment / confidence (+ load) |
| `access-scoring.ts` | Soft friction |
| `ranking.server.ts` | Provider orchestration → pillars → uses score helpers |
| `load-evidence.ts` | Cushion → availability state + multiplier |
| Docs: `access-aware-plan-engine.md`, `load-aware-ranking.md` | Full specs |

### New-repo guidance

- Mock judgments OK at first, but when you implement real scoring, **copy `option-scoring.ts` + `access-scoring.ts` (+ `load-evidence.ts`)** rather than re-deriving weights.
- Sort Ways / options by `score` desc, then persist `rank` 1…n. Lifecycle advance uses that `rank` order.

---

## 11. Travel access & operator eligibility (imperative)

### Access model

```text
AccessType per airline IATA:  home | zed | other
```

| Rule | Why |
|------|-----|
| User-declared only | Never infer from alliance / codeshare / GF8 / marketing |
| `effectiveStaffTravelCarriers ⊆ savedTravelAccess` | Client may narrow; never expand |
| GF8 discovery ≠ eligibility | One broad discovery call; filter locally to declared access |
| Airline-general | `home` is relationship to an airline — not “United privilege” |

**Files:** `travel-access.ts` (`resolveTravelAccess`, `effectiveStaffTravelCarriers`, `accessTypeForCarrier`)

### Operator eligibility (deterministic)

**File:** `staff-eligibility.ts`

| Situation | `staffEligibility` | Notes |
|-----------|--------------------|-------|
| Not verified yet | `uncertain` | Still rankable; confidence haircut only |
| Verify API failed | `uncertain` | **Never** ineligible from failure alone |
| Operator not determinable | `uncertain` | |
| All operators ∈ allowed access | `eligible` | |
| Any operator outside access | `ineligible` | Lifecycle will not promote |

```text
pre-verify → uncertain + unverified
lazy ADB verify on current / primary paths — not verify-all
```

### New-repo guidance

- Onboarding must capture home airline + access list before Plan build matters.
- Mock: treat all mock flights as `eligible` / `home` until verify exists.
- Do not hide flights solely for `uncertain`.

---

## 12. Identity — option_key / segment_key (imperative)

**File:** `option-key.ts` (small, pure — **copy wholesale**)

```text
flight_label = display only (UA2110)
segment_key  = CARRIERNUM:ORIG-DEST:YYYY-MM-DDTHH:MM
option_key   = segment_key | segment_key | …   (itinerary)
```

Examples:

```text
UA881:ORD-HND:2026-10-15T17:00
UA881:ORD-HND:2026-10-15T17:00|NH891:HND-SGN:2026-10-15T09:00
```

| Use | Key |
|-----|-----|
| Sync / dedupe plan options after rerank | `option_key` |
| Reported loads / shared snapshots | `segment_key` |
| UI chips | `flight_label` |

Same marketing flight number on different times/paths = **different** keys.  
Never merge loads or options on label alone.

---

## 13. Coverage — absence is never positive evidence (imperative)

**File:** `coverage.ts`

```text
CoverageState: available | not_covered | unavailable | unknown
SignalState:   good | fair | poor | unknown
```

| Situation | Correct behavior |
|-----------|------------------|
| No FAA feed outside US coverage | `not_covered` / unknown signal — **not** “Normal ops” |
| Provider timeout | `unavailable` — **not** a travel event |
| History missing | history pillar `unknown` — mid score weight, honest copy |

Missing international BTS/FAA must never look like a healthy green pillar.

---

## 14. Flight presence & cancellation (imperative)

**File:** `watch-flight-state.server.ts`

| Rule | Why |
|------|-----|
| Presence from **status / board**, never from “missing in rerank” | Ranking gaps ≠ cancellation |
| `delayed` ⇒ still `operating` | Don’t treat delay as departed/cancel |
| Cancel **event only on transition** into cancelled | No spam every recheck |
| `isTravelDayWatchOver` = travelDate end UTC + 6h | Cron stop burning calls (lifecycle complete is the mid-day stop) |

Lifecycle (option departed by `schedDepUtc`) and watch presence (provider status) are related but distinct — advance can happen from schedule even if status is stale.

---

## 15. Old-repo function index (reference)

### Lifecycle (clean — prefer portable file)

`src/lib/aircue/plan-lifecycle.server.ts`

- Pure: `resolvePlanLifecycle`, `isOptionActionable`, `applyLifecycleView`, `pickActionablePlan`, …
- Write: `resolveAndPersistPlanLifecycle`, `getCurrentPlanForHome` (Supabase-coupled)

### Ranking / scoring (prefer pure modules)

| Function / file | Intent |
|-----------------|--------|
| `scoreFromPillars` / `judgmentFromScore` / `confidenceFromPillars` | Canonical scoring |
| `applyAccessAwareScore` / `accessFrictionPoints` | Soft access + clears |
| `rescoreOptionPillars` | Load-aware local rescore |
| `rankStandbyOptions` | Heavy orchestration (providers) — reference only |

### Access / eligibility / identity

| Function / file | Intent |
|-----------------|--------|
| `resolveTravelAccess` / `effectiveStaffTravelCarriers` | Declared access |
| `preVerifyEligibility` / `resolveStaffEligibility` | Operator eligibility table |
| `buildOptionKey` / `buildSegmentKey` | Canonical identity |
| Coverage helpers in `coverage.ts` | not_covered vs signal |

### Calls / watch / presence

| Function | Intent |
|----------|--------|
| `decideWatchOutcome` | skip \| notify-only \| rerank |
| `gatherWatchSignals` | Cheap signals + cache metrics |
| `recheckWatch` | Lifecycle first, then gate, then maybe rank |
| `classifyFlightStatus` / `shouldEmitCancellation` | Presence & cancel transitions |

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

### Pure modules worth copying early (no / low providers)

```text
docs/handoff/plan-lifecycle.portable.ts   → already prepared
src/lib/aircue/option-key.ts
src/lib/aircue/access-scoring.ts
src/lib/aircue/option-scoring.ts
src/lib/aircue/staff-eligibility.ts
src/lib/aircue/travel-access.ts
src/lib/aircue/coverage.ts
src/lib/aircue/connection-viability.server.ts  (geo helper optional)
src/lib/aircue/watch-signal-gate.ts
src/lib/aircue/watch-flight-state.server.ts
src/lib/aircue/load-evidence.ts
```

### UI vocabulary target

Home = Current Plan; Ways / Load / Activity are Plan-scoped; tabs = Home · Plans · You.  
Full hierarchy: **§20** below. ASCII layouts: `docs/ui-wireframe-function-map.md`. Rork Stage prompts: `docs/rork-prompt-standbye.md`.

---

## 16. Prompt for the new Cursor chat (paste after this doc)

```text
You are working in the new Standbye Rork repo.

I am pasting a domain handoff from the old backend repo (includes screen hierarchy in §20).
1. Add plan-lifecycle.portable.ts into src/domain/plan-lifecycle.ts
2. Prefer copying pure scoring modules when implementing real judgments:
   option-scoring, access-scoring, option-key, staff-eligibility, load-evidence
3. Do not reimplement advance/complete — import resolvePlanLifecycle
4. Implement navigation from §20:
   Tabs = Home · Plans · You only
   Home owns Current Plan + stack: Ways, Load, Activity, New Plan
   Plans = library only; opening a Plan jumps to Home (or read-only Done)
   No Updates tab; no Escape mode; Activity is Plan-scoped
5. Wire PlanContext:
   - After Build: currentFlightId = rank-1 open, watching=true
   - Home focus: resolve lifecycle; persist advance/complete
   - Derive Flight.state current|open|passed
   - pickActionablePlan for Home
6. Invariants you must NOT break:
   - Scoring: four pillars + weights; soft access/clears friction; no boarding %
   - Access declared-only; uncertain ≠ ineligible; effective ⊆ saved
   - Identity: option_key / segment_key — never merge on flight_label
   - Coverage: missing data ≠ good ops
   - Cancel: status transition only — never infer from ranking gaps
   - Watch: skip | notify-only | rerank — never always-rerank / always-force
   - Lifecycle BEFORE watch signals
   - Every Way There = airport paths; options ⊆ strategy paths
   - One viability policy; networkBreadth before detour
   - Load attach = local rescore only — zero GF8/ADB; do not auto-switch current
7. Keep travelDate when complete; Done ≠ Past
8. List every file you change

Full rules: docs/domain-handoff-for-rork.md (+ ui-wireframe-function-map.md if attached)
```

---

## 17. Quick tests the new repo should keep

| Case | Expect |
|------|--------|
| Current departed, later open | advance to next rank |
| All departed | complete; end watch |
| Current still future | no advance |
| Ineligible next, eligible later | skip ineligible |
| Today Done + tomorrow active | Home picks tomorrow |
| Strong pillars | favorable (~score ≥ 76) |
| Soft access: weak home vs strong zed | zed can rank higher |
| Load attach | ranks may move; current unchanged; no provider calls |
| Cancel operating→cancelled | one event; not every recheck |
| Quiet watch, unchanged signals | outcome `skip` |
| Home with active plan | one current flight — no full list |
| Plans library Done same day | under Today → Done, not Past |

---

## 18. Invariant checklist (cost + simplicity + correctness)

### Ranking / access / identity
- [ ] Same scorer for build and load resort
- [ ] Pillar weights: avail 1.2, ops 1.0, recovery 0.8, history 0.4
- [ ] Access/clears are soft friction — not a hard airline sort
- [ ] No boarding probability / clearance %
- [ ] `effectiveStaffTravelCarriers ⊆ savedTravelAccess`
- [ ] Pre-verify = `uncertain` (rankable); verify failure ≠ ineligible
- [ ] `option_key` / `segment_key` for sync and loads; `flight_label` display-only
- [ ] Missing coverage → unknown / not_covered — never fake “Normal”

### Calls / watch / presence
- [ ] Quiet watch → `skip` (no GF8, no forced ADB)
- [ ] Notify-worthy non-rank change → `notify-only`
- [ ] Lifecycle before signal evaluation
- [ ] Cancellation only on transition into cancelled
- [ ] Presence from status/board — not from ranking miss

### Every Way There / viability
- [ ] Board intersection, not hub shortlists
- [ ] `options` connection paths ⊆ `strategies` paths
- [ ] Same viability for discovery and option admission
- [ ] `networkBreadth` before detour filter

### Loads / lifecycle
- [ ] Load save = local rescore, zero provider calls
- [ ] Load does not auto-change current flight
- [ ] Loads keyed by `segment_key`
- [ ] Done keeps `travelDate`; Past is calendar-only
- [ ] Reads never write lifecycle

### Screens / IA
- [ ] Only three tabs: Home · Plans · You
- [ ] No Updates / Escape top-level surfaces
- [ ] Home = one current flight composition (not a dashboard)
- [ ] Ways / Load / Activity nested under Plan (Home stack)
- [ ] Plans tab = library only

---

## 19. One-line summary for the other agent

**Port pure lifecycle + scoring/access/identity modules. Gate paid calls (`skip` / `notify-only` / `rerank`). Discover Ways by board intersection + one viability policy. Score with four pillars and soft access friction — never boarding odds. Loads are segment-keyed local evidence with zero GF8 on attach. Uncertain ≠ ineligible. Missing coverage ≠ good. Cancel only on status transition. Done ≠ Past. Tabs = Home · Plans · You; Home owns the Plan stack. Never mutate inside a generic read.**

---

## 20. Routes & screen hierarchy (wireframe flow)

This is the **clean-slate IA** — not the old Lovable route tree. Full ASCII layouts live in `docs/ui-wireframe-function-map.md`.

### Tabs (only three)

```text
┌─────────────────────────────────────┐
│           SCREEN BODY               │
├─────────────────────────────────────┤
│   Home          Plans         You   │
└─────────────────────────────────────┘
```

| Tab | Owns | Does not own |
|-----|------|--------------|
| **Home** | Current Plan + Plan stack (Ways, Load, Activity, New Plan) | Full library list |
| **Plans** | Library index only | Working a Plan |
| **You** | Profile / access / help | Trip work |

**Rule:** Opening a Plan from Plans → jump to **Home** (actionable) or read-only Done view. Tab highlight: Plan-scoped screens keep **Home** selected, not Plans.

### Suggested route map (Expo / Rork)

```text
/(auth)
  splash
  sign-in
  onboarding          ← F1 (4 steps)

/(app)                ← tab navigator
  home/               ← F3 Current Plan (or empty → new-plan)
    new-plan          ← F2
    known-flight      ← optional F2 subpath
    ways              ← F4  (plan-scoped)
    ways/switch       ← F5 sheet/confirm (or modal)
    flight/:flightId  ← F10 Flight detail (evidence: ops/weather/holiday/load)
    load              ← F6
    activity          ← F7
  plans/              ← F8 library ONLY
    [no nested work screens — open → home]
  you/                ← F9
```

Do **not** create: `/updates`, `/escape`, `/options/:id` as top-level products.

### Function → screen

| # | Job | Screen | One purpose |
|---|-----|--------|-------------|
| F0 | Enter | Splash / Sign in | Start |
| F1 | Setup | Onboarding | Access + home airport |
| F2 | Create | New Plan | Route + day |
| F3 | Work | **Home / Current Plan** | What to try **now** |
| F4 | Adjust | Ways | Other ways on this Plan |
| F5 | Commit | Sheet (not a tab) | Make this current |
| F6 | Report | Load | Seats / standbys |
| F7 | Explain | Activity | What changed (Plan-scoped) |
| F8 | Archive | Plans library | Today / Upcoming / Past |
| F9 | Profile | You | Access maintenance |
| **F10** | Explain flight | **Flight detail** | Pillars / holiday / load CTA (see `flight-evidence-watch-signals-handoff.md`) |

### App flow

```text
Splash → Onboarding (once) → HOME
                              │
              has actionable Plan?
                 │            │
                yes           no
                 │            └──► New Plan (F2) ──build──► Current Plan
                 ▼
          CURRENT PLAN (F3)
           │    │     │      │
           ▼    ▼     ▼      ▼
         Ways  Load  Activity  tap flight → F10 detail
           │                      │
           └── Make current (F5)  └── Add a load → F6
           └── tap row → F10

Plans library (F8)
  Today: Current | Done
  Upcoming | Past
  tap Current → Home
  tap Done/Past → read-only summary (no watch CTA)
```

### Home states (must implement)

| State | UI |
|-------|-----|
| A. No actionable Plan | Show New Plan |
| B. Active Plan | One current flight + watching + CTAs |
| C. Advanced mid-day | Same layout, new flight (quiet) |
| D. Complete same day | “Today’s trip is done” + Plans / New plan |
| E. Next Plan is tomorrow | Show tomorrow’s Plan (or soft empty today) |

### Current Plan composition budget (F3)

First viewport only:

```text
Brand · route · date
ONE current flight (number, time, countdown, judgment, one why line)
“Standbye is watching”
“N other ways still open”
[See other ways] [Add what I see]
optional one-line “What changed”
secondary: New plan
```

**Not on Home:** full flight list, strategy cards, stats strip, load form, activity feed.

### Ways hierarchy (F4)

```text
CURRENT
STILL OPEN   ← actionable
PASSED       ← read-only history that day
Ways there   ← path chips (strategies) filter the list
tap open row → sheet → [Make this current]
```

### Plans library grouping (F8)

```text
TODAY      Current | Done     ← Done ≠ calendar past
UPCOMING
PAST                          ← travelDate < today only
```

### Build order (UI)

1. New Plan → 2. Current Plan → 3. Ways (+ switch) → 4. **Flight detail (F10)** → 5. Plans library → 6. Load → 7. Activity → 8. Onboarding / You

### Deliberately omitted surfaces

| Old / noise | Replacement |
|-------------|-------------|
| Updates tab | Activity under Plan (F7) |
| Escape mode | Later / trip option — not a product |
| Option detail app | Sheet / Flight detail under Ways+Home — evidence still attaches (see `flight-evidence-watch-signals-handoff.md`) |
| Compare primary path | Optional later in Ways |
| Dashboard Home | One composition only |
