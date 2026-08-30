# Load-aware plan scoring — implementation spec

Status: **Phases A–D implemented** (Phase E watch snapshot deferred)

Presentation of the GF8 / public-booking pillar is documented in
[`public-booking-truthfulness.md`](./public-booking-truthfulness.md). This file
covers **load evidence and scoring**. Public booking is commercial sellability —
not physical seats or standby load.

## Problem

Reported loads were once a **read-time overlay**. They could change judgment on a
card while `plan_options.rank` stayed frozen from public-signal ranking — rank #1
could show **Riskier** after a fresh load.

## Goal

User-entered loads are **first-class plan evidence**: same deterministic scoring
path as public booking, operations, recovery, history, and access. Adding a load
**locally rescores and resorts** the existing plan with **zero new GF8/provider
calls**.

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
- `reported_loads.party_included` — `yes` / `no` / `unsure` (or null)
- `loadsForSegments()` — `Map<segmentKey, ReportedLoad>`
- Itinerary availability pillar = **worst** segment load state among legs (same pattern as connection public booking)

Never merge loads across distinct `option_key` rows because `flight_label` matches.

---

## Data model

### `reported_loads`

Segment-scoped loads with tri-state party inclusion (not a boolean “already listed”).

```typescript
interface ReportedLoad {
  id: string;
  segmentKey: string;
  flightLabel: string;      // display
  openSeats: number | null;
  standbys: number | null;
  partyIncluded: "yes" | "no" | "unsure" | null;
  cabin: string;
  source: string;
  checkedAt: string;
}
```

---

## `LoadEvidence` (internal)

Not shown as probability. Drives the availability pillar (display title **Reported load** when a load exists) + score multiplier.

```typescript
interface LoadEvidence {
  segmentKey: string;
  effectiveOpen: number | null;
  effectiveListed: number | null;
  cushion: number | null;
  partySize: number;
  partyIncluded: "yes" | "no" | "unsure" | null;
  sourceStrength: number;       // 0–1
  freshnessMinutes: number;
  freshnessMultiplier: number;  // 0–1
  cabin: string;
}
```

Party math (`computeLoadEvidence`):

```text
partyIncluded yes:
  effectiveListed = reportedStandbys
  cushion = open - effectiveListed   (when open known)

partyIncluded no:
  effectiveListed = reportedStandbys + partySize
  cushion = open - effectiveListed   (when open known)

partyIncluded unsure / null:
  effectiveListed = null
  cushion = null
  → partial reported evidence
  → public booking preserved for ranking
  → confidence lowered
  display: Reported load · Partial
```

When `standbys` is null, cushion stays null regardless of `partyIncluded` (unknown demand is not zero).

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

Weights match `ranking.server.ts` `scoreOf` (availability × 1.2). Complete load replaces availability **pillar state** when a fresh-enough segment load exists; recovery/ops/history unchanged. Partial load keeps public booking for ranking and shows **Partial** for display.

Load does **not** automatically win: a great load on a last-flight option can still rank below a tighter load + excellent recovery.

---

## Ranking engine (`ranking.server.ts`)

`RankInput` gains:

```typescript
reportedLoadsBySegment?: Map<string, ReportedLoad>;
travelers: number; // already present
```

In `scoreLeg` / connection / GF8 paths:

1. Compute public booking pillar (internal key `availability`; labels from `publicBookingPresentation`)
2. If complete segment load exists → replace leg availability with load-derived pillar
3. Connection: `worst()` across leg availability states
4. Unified score → sort → assign rank

`syncPlanOptionsFromRanked` passes `loadsForSegments` for all segment keys on the plan.

---

## `attachLoad` flow (`plan.server.ts`)

```text
1. Resolve target segment_key (form input or sole segment)
2. INSERT reported_loads (segment_key, party_included, flight_label for display)
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

- **Are your travelers already included in that standby count?** Yes / No / Unsure → `partyIncluded`
- **Segment picker** when `segments.length > 1`
- Post-submit: navigate to plan detail with banner if `bestOptionChanged`

Copy:

> **Your best option changed.** A fresh reported load changed the picture. {newPreferred} now has the stronger overall setup.

Primary unchanged; banner does not auto-switch Primary.

### Signals disagree

When public booking and fresh load conflict on a segment, show on option cue:

> Signals disagree. Your fresh employee-reported load is stronger evidence right now.

### Source-aware titles

When `option.load` exists, the availability pillar titles as **Reported load**. Otherwise **Public booking**. Compare uses a neutral **Load / booking** row with per-cell sources. See [`public-booking-truthfulness.md`](./public-booking-truthfulness.md).

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

- `load-evidence`: party size, `partyIncluded` yes/no/unsure, cushion, freshness decay, partial neutrality
- `option-scoring`: load overrides public; recovery beats great load on last flight
- `rescore plan`: UA123 2/15 drops from #1; AA789 21/4 jumps to #1
- Segment identity: two UA1448 departures — load on one segment does not affect the other
- Connection: load on first leg only → worst() with second leg public
- `attachLoad`: zero provider calls; primary_option_id unchanged

---

## Success criteria

| Behavior | After |
|----------|-------|
| Availability / judgment / confidence / score | Load-driven when complete |
| Rank order | Load-driven when complete |
| Best option (#1) | Matches rescored sort |
| Primary | User-controlled only |
| attachLoad cost | No GF8 calls |
| Boarding probability | Never |
| Public booking labels | Party-size commercial signal only — never seats/odds |
