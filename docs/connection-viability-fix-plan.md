# Connection Viability Fix — Pre-Lovable Lock Plan

**Status:** Implemented — backend lock candidate  
**Audience:** Cursor  
**Branch:** `main` (post Phase 2)  
**Supersedes:** Phase 3 (long-sit layover relaxation) for launch  
**Related:** `docs/every-way-there-backend-audit.md`, `docs/every-way-there-restructure-plan.md`

---

## Executive call

The funnel audit found a **real consistency bug**, not a tuning question.

Do **not** lock Phase 2 for Lovable QA while this behavior exists:

```text
Discovery (Strategy):
OKC → IAH → ORD = invalid

Option pipeline:
OKC → IAH → ORD = ranked #3
```

The backend cannot simultaneously say a path is outside the Plan's viable search space **and** recommend flights on that same path.

Fix the inconsistency **before** Lovable screenshot QA. The architecture is good; the old option pipeline is violating the new architecture in one specific place.

---

## The rule (product + backend)

> **If a connection can become a normal Plan option, it must also be eligible to become a PlanStrategy under the same viability policy.**

And conversely:

> **If normal-mode viability truly rejects a path, the option pipeline must not quietly reintroduce it.**

Never:

```text
Strategy discovery says NO
but
Option pipeline says YES
```

### Path subset invariant (locked)

```text
plan.options connection paths  ⊆  plan.strategies paths     ✅ always
plan.strategies paths          ⊆  plan.options paths        ❌ never required
```

Strategies remain **broader** than deeply scored recommendations. Options are a subset of viable paths, not the other way around.

**Correct after fix (OKC → ORD example):**

```text
Strategies
──────────
OKC → ORD
OKC → IAH → ORD
OKC → DEN → ORD

Options
───────
UA xxxx  OKC → ORD
UA yyyy  OKC → ORD
OKC → IAH → ORD combination
…
```

**Impossible after fix:**

```text
Option:   OKC → IAH → ORD
Strategy: ❌ missing
```

**Consistently rejected (both layers):**

```text
IAH → ORD → OKC   ratio ~4.09
Strategy ❌
Option   ❌
```

**Thin-network survivor (both layers when scored):**

```text
OKC → IAH → ORD   ratio ~1.91
Strategy ✅  caveat: strong backtrack
Option   ✅  if it earns a rank slot
```

---

## Root cause (what Phase 2 exposed)

Phase 2 fixed breadth (board intersection) and separation (`plan.strategies[]` vs `plan.options[]`).

What remains broken is **policy divergence**:

| Path | Detour ratio | Strategy discovery (1.45 cap) | Option pipeline (GF8 / board scoring) |
|------|--------------|--------------------------------|----------------------------------------|
| OKC → IAH → ORD | ~1.91 | ❌ rejected | ✅ ranked option |
| OKC → DEN → ORD | ~1.99 | ❌ rejected | may appear via GF8 |
| IAH → ORD → OKC | ~4.09 | ❌ rejected | should stay ❌ |
| IAH → DEN → OKC | ~3.43 | ❌ rejected | should stay ❌ |

The problem is **not** `MAX_LAYOVER = 360`. It is **detour eligibility + inconsistent admission** across two code paths.

---

## Fix 1 — One shared viability function

Do **not** fix Strategy discovery and Option admission separately.

### Discovery pipeline order (avoid circular thin-route detection)

Compute **`networkBreadth` before applying detour policy**. Do not let detour filtering influence the count used to decide which detour rule applies.

```text
Raw board intersection
        ↓
carrier / access filter
        ↓
same-city / destination exclusions
        ↓
timing pairing (MIN/MAX layover)
        ↓
NETWORK BREADTH  ← computed here, before detour
        ↓
shared detour viability (evaluateConnectionViability)
        ↓
eligible Strategies
        ↓
maybe deep-score → Options
```

**Definition:**

```typescript
networkBreadth =
  number of distinct X stations
  that have at least one time-sequenceable A→X→B pair
  after access + basic structural filters
  but BEFORE detour filtering
```

Then detour ceiling is deterministic:

```text
networkBreadth >= THIN_THRESHOLD  →  broad network → detour ceiling 1.45
networkBreadth <  THIN_THRESHOLD  →  thin network   → detour ceiling 2.0
```

(`THIN_THRESHOLD` — pick a fixed constant, e.g. 3 or 5, and document it in code + tests.)

Centralize something conceptually like:

```typescript
evaluateConnectionViability(input: {
  origin: string;
  via: string;
  destination: string;
  mode: "normal" | "escape" | "expert";
  networkBreadth: number;   // pre-detour count — see pipeline above
  timing: { layoverMin: number; /* ... */ };
  access: Set<string> | null;
  geo: { detourRatio: number | null; addedMinutes: number | null };
}): {
  eligible: boolean;
  detourCeiling: number;
  caveat: "none" | "backtracking" | "strong_backtrack" | null;
  reason?: string;
}
```

**Both** must call it:

```text
board-intersection Strategy discovery   (strategy-discovery.server.ts)
connection Option admission             (ranking.server.ts — scoreConnection, scoreGf8Candidate, merge)
```

Target architecture:

```text
Candidate path
      ↓
ONE viability policy (evaluateConnectionViability)
      ↓
Strategy exists in plan.strategies[]
      ↓
maybe deep-score it
      ↓
maybe Option exists in plan.options[]
```

### Consumers to wire

| Consumer | File | Must use shared policy |
|----------|------|------------------------|
| Board intersection discovery | `strategy-discovery.server.ts` | ✅ replace inline `MAX_DETOUR_BEST` / ratio filter |
| Deep connection scoring | `ranking.server.ts` → `scoreConnection` | ✅ reject before scoring if ineligible |
| GF8 itinerary merge | `ranking.server.ts` → `scoreGf8Candidate` / `mergeByOptionKey` | ✅ filter connection candidates |
| Escape mode | `ranking.server.ts` → `rankEscapeRoutes` | ✅ same function, `mode: "escape"` params |
| Expert via check | `evaluateEscapeVia` | ✅ `mode: "expert"` — user-named station skips detour veto only, not timing/access |

---

## Fix 2 — Contextual detour policy (not station classification)

**Do not add:**

```typescript
if (smallStation) { ... }
```

That reintroduces station classification through the side door.

Instead, make viability **contextual to the route network**.

### Normal mode (`mode: "normal"`)

```text
Broad intersection (many viable X stations)
→ hard detour ceiling: 1.45
→ ratio >= 1.22 → backtracking caveat (not exclusion)

Thin intersection (very few viable X stations — see `networkBreadth`)
→ allow detour up to 2.0
→ ratio >= 1.22 → strong backtrack caveat
```

**Thin route** = `networkBreadth` below threshold **after timing pairing, before detour** — not origin/dest airport size, not post-detour survivor count.

### Expected outcomes (OKC route shapes)

```text
IAH → DEN → OKC     ratio 3.43   ❌ still rejected
IAH → ORD → OKC     ratio 4.09   ❌ still rejected

OKC → IAH → ORD     ratio 1.91   ✅ allowed — strong backtrack caveat
OKC → DEN → ORD     ratio 1.99   ✅ allowed — strong backtrack caveat
```

Rationale:

- `OKC → IAH → ORD` is geographically inefficient, but when nonstops look terrible it is **exactly** the kind of weird path a nonrev employee might take home.
- `IAH → ORD → OKC` at 4.09× direct is a different category — normal Plan should not treat that as a reasonable route just because flights exist.

### Escape mode

Keep wider defaults (`mode: "escape"`, detour up to 2.0+) — unchanged intent.

### Expert via

User-named station (`evaluateEscapeVia`) skips **detour veto** only. Timing, access, and layover rules still apply.

---

## Fix 3 — Connection evidence on option-derived Strategies

When a connection path survives and becomes a Strategy, it must carry normalized evidence — even if it entered through ranked options rather than board-intersection seeds.

**Invariant:** every 3-airport Strategy has `connection !== null`.

**Do not fabricate counts.** `inboundCount` and `onwardCount` mean **known supporting flights** — not assumed total network counts. Never manufacture `6 inbound / 8 onward` unless the snapshot actually proved those counts.

### Evidence priority (preferred order)

```text
1. intersection evidence     (board snapshot — full inbound/onward counts)
        ↓
2. existing Gateway evidence (server-side gateway build)
        ↓
3. option segments           (minimal truthful counts from scored itinerary)
```

If the only evidence is one scored itinerary:

```text
OKC → IAH
IAH → ORD
```

then this is **truthful**:

```typescript
connection: {
  via: "IAH",
  inboundCount: 1,
  onwardCount: 1,
  summary: "Connection through IAH",
}
```

**Bad (today):**

```typescript
// OKC>IAH>ORD exists as Strategy from optionRefs
{
  id: "OKC>IAH>ORD",
  path: ["OKC", "IAH", "ORD"],
  connection: null,   // ❌ crippled product object
  gateway: null,
}
```

**Required (intersection-derived — full counts OK):**

```typescript
{
  id: "OKC>IAH>ORD",
  path: ["OKC", "IAH", "ORD"],
  connection: {
    via: "IAH",
    inboundCount: 6,   // ✅ only if snapshot proved 6
    onwardCount: 8,    // ✅ only if snapshot proved 8
    summary: "6 realistic shots into IAH, 8 useful flights onward to ORD.",
  },
}
```

### Implementation direction

In `buildStoredStrategies` / `buildStrategyCatalog`:

1. When merging `optionRefs` for a 3-airport path, **synthesize `connection` evidence** using the evidence priority above.
2. Prefer intersection seed evidence when both exist (higher fidelity counts).
3. Option-only paths get minimal truthful counts (typically `1/1`), not network-wide guesses.
4. Internal provenance (`intersection-derived` | `gateway-derived` | `option-derived`) may remain for debugging — but must not produce `connection: null` on obvious connection topology.

Files:

- `src/lib/aircue/plan-strategy.ts` — `buildStoredStrategies`, `connectionEvidenceFromPath(...)` or similar
- Tests in `src/lib/aircue/__tests__/plan-strategy.test.ts`

---

## Phase 3 — Retired for launch

The audit answered the open question.

**Do not** relax `MAX_LAYOVER = 360` for launch.

Revisit 6+ hour connection sits later based on actual user behavior. The launch blocker is detour + admission consistency, not layover duration.

---

## API usage counter (618/600) — do not hack for testing

Since it is August 31:

- **Do not** manually zero historical usage just to get a few more hours of testing unless live testing today is absolutely required.
- Leave the 600 safety rail closed; let September reset naturally.

### Follow-up (not this PR)

Cursor should eventually make internal usage accounting **credential-aware** when RapidAPI keys rotate:

```text
old credential usage
+
new credential usage
=
one internal counter   ← bug class to fix later
```

Preserve historical rows. Do not use counter deletion as the normal key-rotation mechanism.

---

## Updated delivery sequence

```text
✅ Phase 2 architecture
✅ Board intersection
✅ Route-shape validation
✅ Funnel audit
✅ API cap restored

NOW
↓
Fix shared connection viability (one function, both consumers)
↓
Fix connection evidence on option-derived Strategies
↓
Run focused live tests:
   OKC → ORD
   IAH → OKC
   OKC → CVG
↓
Lock backend
↓
Lovable screenshot QA
```

**Stop backend work after this correction.** No Phase 3. No Every Way There UI until backend lock.

---

## Implementation checklist

### Shared viability

- [x] New module `src/lib/aircue/connection-viability.server.ts`
- [x] Pipeline order: intersection → access → structural → timing → **networkBreadth** → detour
- [x] `networkBreadth` = distinct X with ≥1 sequenceable A→X→B pair, **before** detour filter
- [x] Fixed `THIN_NETWORK_THRESHOLD` (5); broad → 1.45, thin → 2.0; `>= 1.22` → caveat tiers
- [x] `evaluateConnectionViability()` — same function for Strategy discovery and Option admission
- [x] Wire into `discoverConnectionGatewaysFromSnapshot`
- [x] Wire into GF8 connection admission — reject ineligible before merge
- [x] Escape + expert modes use same function with different params
- [x] Remove duplicate `MAX_DETOUR_*` from strategy-discovery

### Connection evidence

- [x] Evidence priority: intersection → gateway → option segments
- [x] Never emit `connection: null` for 3-airport paths
- [x] Option-only evidence: truthful minimal counts (e.g. `1/1`), never fabricated network totals
- [x] Unit tests: OKC>IAH>ORD from options has `connection.via === "IAH"`, counts match known evidence only

### Consistency tests (must pass before lock)

- [x] **Subset invariant:** connection option path ids ⊆ strategy path ids (enforced in rankStandbyOptions)
- [x] Unit tests for detour policy (OKC→IAH→ORD thin, IAH→ORD→OKC rejected)
- [ ] Live focused routes: OKC→ORD, IAH→OKC, OKC→CVG (requires RapidAPI key)
- [x] `strategyDiscovery.status` unchanged

### Live scripts

```bash
AERODATABOX_RAPIDAPI_KEY=... bun scripts/test-phase2-route-shapes.ts
# Add or extend focused cases:
#   OKC→ORD, IAH→OKC, OKC→CVG
# Assert options/strategies path-id parity
```

---

## Acceptance criteria (backend lock)

1. **Subset invariant:** `plan.options` connection path ids ⊆ `plan.strategies` path ids — always. Strategies may be strictly broader.
2. **No silent bypass:** GF8 and board scoring cannot admit paths Strategy discovery would reject under the same `mode` and pre-detour `networkBreadth`.
3. **Evidence truthful:** Every 3-airport Strategy has non-null `connection` with correct `via`; counts reflect known evidence only (no fabricated network totals).
4. **networkBreadth pre-detour:** Thin/broad detour ceiling decided from timing-qualified X count before detour filter runs.
5. **No station taxonomy:** No `smallStation`, `hub`, or focus-city checks in viability code.
6. **Phase 3 untouched:** `MAX_LAYOVER` remains 360 minutes for launch.

**After focused parity tests pass: lock the backend and stop.** No more architecture work, no layover relaxation, no new discovery features. Then Lovable gets screenshot QA against this stable contract.

---

## Explicitly out of scope

- Lovable / Every Way There UI
- Phase 3 layover relaxation (6+ hour sits)
- Manual API counter zeroing
- Station size / hub classification
- Route graph or external path feed

---

## One-page summary

**Bug:** Strategy discovery and Option admission use different detour/viability rules. A path can be ranked #3 while absent from (or rejected by) `plan.strategies[]`.

**Fix:** One `evaluateConnectionViability()` used everywhere. Compute `networkBreadth` (timing-qualified X count) **before** detour filtering; thin networks get 2.0 ceiling in normal mode; absurd paths (4× direct) still rejected. Option-derived Strategies get truthful `connection` evidence — never null, never fabricated counts.

**Invariant:** connection option paths ⊆ strategy paths. Always. Not the reverse.

**Then:** Lock backend → Lovable QA. Stop.
