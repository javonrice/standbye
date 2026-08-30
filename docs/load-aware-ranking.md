# Load-aware plan scoring — implementation spec

Status: **Phases A–D implemented** (Phase E watch snapshot deferred)

## Problem

Reported loads today are a **read-time overlay** (`optionFromRow` + `load-adjust.ts`). They can change judgment on a card while `plan_options.rank` stays frozen from public-signal ranking — rank #1 can show **Riskier** after a fresh load.

## Goal

User-entered loads become **first-class plan evidence**: same deterministic scoring path as availability, operations, recovery, history, and access. Adding a load **locally rescores and resorts** the existing plan with **zero new GF8/provider calls**.

## Non-goals

- Boarding probability / clearance odds
- Rewriting recovery/ops/history calculations (loads score *against* them)
- Changing `plans.primary_option_id` when rank #1 changes (Primary stays until user changes it)
- Watch gate complexity blocking core attach/resort (watch snapshot extension follows in Phase E)

---

## Identity: segment keys, not flight labels

**Canonical load identity** is a **single flight segment key**, same format as one leg of `option_key`:

```text
CARRIERNUM:ORIG-DEST:YYYY-MM-DDTHH:MM
```

Examples:

```text
Option key (itinerary):  UA881:ORD-HND:2026-10-15T17:00|NH891:HND-SGN:2026-10-15T09:00
Load on UA881 segment:   UA881:ORD-HND:2026-10-15T17:00
Load on NH891 segment:   NH891:HND-SGN:2026-10-15T09:00
```

Implementation:

- `buildSegmentKey()` in `option-key.ts` (one segment)
- `reported_loads.segment_key` — primary lookup key
- `reported_loads.flight_label` — display / legacy fallback only
- `loadsForSegments()` — `Map<segmentKey, ReportedLoad>`
- Itinerary availability = **worst** segment load state among legs (same pattern as connection public availability)

Never merge loads across distinct `option_key` rows because `flight_label` matches.

---

## Data model

### `reported_loads` (migration)

```sql
ALTER TABLE reported_loads
  ADD COLUMN segment_key text,
  ADD COLUMN already_listed boolean NOT NULL DEFAULT false;

CREATE INDEX reported_loads_segment_lookup_idx
  ON reported_loads (user_id, segment_key, travel_date, checked_at DESC);
```

### `ReportedLoad` type

```typescript
interface ReportedLoad {
  id: string;
  segmentKey: string;
  flightLabel: string;      // display
  openSeats: number | null;
  standbys: number | null;
  alreadyListed: boolean;
  cabin: string;
  source: string;
  checkedAt: string;
}
```

---

## `LoadEvidence` (internal)

Not shown as probability. Drives availability pillar + score multiplier.

```typescript
interface LoadEvidence {
  segmentKey: string;
  effectiveOpen: number | null;
  effectiveListed: number | null;
  cushion: number | null;
  partySize: number;
  userAlreadyListed: boolean;
  sourceStrength: number;       // 0–1
  freshnessMinutes: number;
  freshnessMultiplier: number;  // 0–1
  cabin: string;
}
```

Party math:

```text
if userAlreadyListed:
  effectiveListed = reportedStandbys ?? 0
else:
  effectiveListed = (reportedStandbys ?? 0) + partySize

cushion = effectiveOpen - effectiveListed
```

Freshness tiers (availability score multiplier):

| Age | Tier | Multiplier |
|-----|------|------------|
| ≤ 30 min | very_strong | 1.0 |
| ≤ 120 min | useful | 0.85 |
| ≤ 360 min | useful | 0.6 |
| > 360 min | stale | 0.35 |

Source strength: `employee_system` 1.0, `stafftraveler` 0.9, `gate_agent` 0.85, default 0.75.

---

## Unified scoring (`option-scoring.ts`)

Single path for ranking and plan resort:

```text
scoreFromPillars(pillars, access, standbyClears, loadMultiplier?)
judgmentFromScore(score, availabilityState, recoveryState)
confidenceFromPillars(pillars, hasSegmentLoad, staffEligibility)
availabilityPillarForOption(segments, publicPillar, loadsMap, travelers)
```

Weights match `ranking.server.ts` `scoreOf` (availability × 1.2). Load replaces availability **pillar state** when a fresh-enough segment load exists; recovery/ops/history unchanged.

Load does **not** automatically win: a great load on a last-flight option can still rank below a tighter load + excellent recovery.

---

## Ranking engine (`ranking.server.ts`)

`RankInput` gains:

```typescript
reportedLoadsBySegment?: Map<string, ReportedLoad>;
travelers: number; // already present
```

In `scoreLeg` / connection / GF8 paths:

1. Compute public availability pillar (unchanged)
2. If segment load exists → replace leg availability with load-derived pillar
3. Connection: `worst()` across leg availability states
4. Unified score → sort → assign rank

`syncPlanOptionsFromRanked` passes `loadsForSegments` for all segment keys on the plan.

---

## `attachLoad` flow (`plan.server.ts`)

```text
1. Resolve target segment_key (form input or sole segment)
2. INSERT reported_loads (segment_key, already_listed, flight_label for display)
3. Load all current plan_options + plan.travelers
4. loadsForSegments(all segment keys on plan)
5. rescoreAndResortPlanOptions() — no network
6. Persist rank, score, label, confidence, pillars per row
7. Compare previous rank-1 id vs new rank-1 id
8. Return { bestOptionChanged, previousPreferredId, newPreferredId, ... }
9. Do NOT change primary_option_id
```

Event kind (client + optional plan prefs banner): `best_option_changed_from_load`.

---

## UI (Phase D)

### Add Load form

- **Are you already on the standby list?** Yes / Not yet → `alreadyListed`
- **Segment picker** when `segments.length > 1`
- Post-submit: navigate to plan detail with banner if `bestOptionChanged`

Copy:

> **Your best option changed.** A fresh reported load changed the picture. {newPreferred} now has the stronger overall setup.

Primary unchanged; banner does not auto-switch Primary.

### Signals disagree

When public booking and fresh load conflict on a segment, show on option cue:

> Signals disagree. Your fresh employee-reported load is stronger evidence right now.

---

## Phases

| Phase | Deliverable |
|-------|-------------|
| **A** | `load-evidence.ts`, `option-scoring.ts`, `buildSegmentKey`, tests |
| **B** | Migration, `loadsForSegments`, ranking accepts loads on rerank |
| **C** | `rescoreAndResortPlanOptions`, `attachLoad` persist + return metadata |
| **D** | Form fields, plan banner, compare/list order from new ranks |
| **E** | Watch snapshot load fingerprints (follows; not blocking C/D) |

---

## Tests (required)

- `load-evidence`: party size, alreadyListed, cushion, freshness decay
- `option-scoring`: load overrides public; recovery beats great load on last flight
- `rescore plan`: UA123 2/15 drops from #1; AA789 21/4 jumps to #1
- Segment identity: two UA1448 departures — load on one segment does not affect the other
- Connection: load on first leg only → worst() with second leg public
- `attachLoad`: zero provider calls; primary_option_id unchanged

---

## Success criteria

| Behavior | After |
|----------|-------|
| Availability / judgment / confidence / score | Load-driven |
| Rank order | Load-driven |
| Best option (#1) | Matches rescored sort |
| Primary | User-controlled only |
| attachLoad cost | No GF8 calls |
| Boarding probability | Never |
