# Connection Viability Fix — Pre-Lovable Lock Plan

**Status:** Approved direction — implement before Lovable QA  
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

Centralize something conceptually like:

```typescript
evaluateConnectionViability(input: {
  origin: string;
  via: string;
  destination: string;
  mode: "normal" | "escape" | "expert";
  networkBreadth: number;   // intersecting station count, etc.
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

Thin intersection (very few viable X stations)
→ allow detour up to 2.0
→ ratio >= 1.22 → strong backtrack caveat
```

**Thin route** = function of `networkBreadth`, e.g. intersecting connection stations below a threshold after timing filter — not origin/dest airport size.

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

**Required:**

```typescript
{
  id: "OKC>IAH>ORD",
  path: ["OKC", "IAH", "ORD"],
  connection: {
    via: "IAH",
    inboundCount: ...,
    onwardCount: ...,
    summary: "...",
  },
  gateway: null,  // deprecated — OK to omit or populate server-side only
}
```

### Implementation direction

In `buildStoredStrategies` / `buildStrategyCatalog`:

1. When merging `optionRefs` for a 3-airport path, **synthesize `connection` evidence** from available leg/gateway data.
2. Prefer intersection seed evidence when both exist.
3. Internal provenance (`option-derived` vs `intersection-derived`) may remain for debugging — but must not produce a Strategy with `connection: null` when topology is obviously a connection.

Files:

- `src/lib/aircue/plan-strategy.ts` — `buildStoredStrategies`, possibly `connectionEvidenceFromPath(...)`
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

- [ ] New module e.g. `src/lib/aircue/connection-viability.server.ts`
- [ ] `evaluateConnectionViability()` with `mode`, `networkBreadth`, detour ratio, timing, access
- [ ] Thin-route detection from intersection count (not station size)
- [ ] Normal broad → 1.45 cap; normal thin → 2.0 cap; `>= 1.22` → caveat tiers
- [ ] Wire into `discoverConnectionGatewaysFromSnapshot`
- [ ] Wire into `scoreConnection` — reject ineligible before scoring
- [ ] Wire into GF8 connection admission — reject ineligible before merge
- [ ] Escape + expert modes use same function with different params
- [ ] Remove duplicate `MAX_DETOUR_*` constants scattered across modules

### Connection evidence

- [ ] Synthesize `StrategyConnectionEvidence` for 3-airport paths from `optionRefs`
- [ ] Never emit `connection: null` for obvious connection topology
- [ ] Unit tests: OKC>IAH>ORD from options has `connection.via === "IAH"`

### Consistency tests (must pass before lock)

- [ ] **OKC → ORD:** if `OKC>IAH>ORD` appears in `plan.options[]`, it **must** appear in `plan.strategies[]` with matching path id
- [ ] **OKC → ORD:** if detour rejects `OKC>IAH>ORD` for Strategy, same path **must not** appear in options
- [ ] **IAH → OKC:** `IAH>ORD>OKC` (ratio ~4.09) rejected in both Strategy and options
- [ ] **OKC → CVG:** thin small-station route gets 2.0 ceiling when intersection is thin; no station-size branching
- [ ] `strategyDiscovery.status` still honest when boards partial

### Live scripts

```bash
AERODATABOX_RAPIDAPI_KEY=... bun scripts/test-phase2-route-shapes.ts
# Add or extend focused cases:
#   OKC→ORD, IAH→OKC, OKC→CVG
# Assert options/strategies path-id parity
```

---

## Acceptance criteria (backend lock)

1. **Parity:** Every connection `optionKey` path has a matching `plan.strategies[]` entry with the same ordered path id.
2. **No silent bypass:** GF8 and board scoring cannot admit paths Strategy discovery would reject under the same `mode` and `networkBreadth`.
3. **Evidence complete:** Every 3-airport Strategy has non-null `connection` with correct `via`.
4. **No station taxonomy:** No `smallStation`, `hub`, or focus-city checks in viability code.
5. **Phase 3 untouched:** `MAX_LAYOVER` remains 360 minutes for launch.

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

**Fix:** One `evaluateConnectionViability()` used everywhere. Thin networks get 2.0 detour ceiling in normal mode; absurd paths (4× direct) still rejected. Option-derived Strategies get proper `connection` evidence.

**Then:** Lock backend → Lovable QA. Stop.
