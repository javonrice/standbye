# Investigation: Board Intersection Discovery for Every Way There

**Question:** Can we discover `A → X → B` by intersecting A’s departure board with B’s arrival board — inspecting far more possible `X` stations without an onward API call per station?

**Answer: Yes.** Live AeroDataBox testing confirms this is viable, cheaper in API calls than the current per-station onward pattern, and surfaces low-frequency stations (like OKC) that the current top-N onward verification misses.

**Status:** Investigation only. Does **not** change the PlanStrategy contract or undo PR #10. This is the recommended **next** discovery-layer improvement.

---

## Executive summary

| | Current `findGateways()` | Proposed board intersection |
|--|--------------------------|-----------------------------|
| **Pattern** | IAH dep board → rank X → call `X→ORD` per station | IAH dep board + ORD arr board → intersect X in memory |
| **Stations verified** | ~8 (budget cap) | **102** on IAH→ORD test (all intersecting X) |
| **OKC on Aug 31 UA** | Missed (rank 16, never checked) | **In intersection** — 6 viable UA pairs from board times alone |
| **Typical ADB FIDS calls** | 2 origin + (8 × 2) onward = **18** | 2 origin + 2 dest = **4** |
| **Timing check** | Per-station onward fetch | In-memory pairing from both boards (`withLeg=true`) |
| **PlanStrategy contract** | Unchanged | Unchanged — feeds `buildStrategyCatalog()` |

---

## How AeroDataBox supports this

Standbye already calls:

```
GET /flights/airports/iata/{IATA}/{fromLocal}/{toLocal}
  ?direction=Departure
  &withLeg=true
  ...
```

The same endpoint supports **`direction=Arrival`** (and `Both`). Documented in AeroDataBox FIDS API.

With `withLeg=true` on an **arrival** board at ORD, each row includes:

- `departure.airport.iata` — origin (e.g. `OKC`)
- `departure.scheduledTime` — when the flight left X
- `arrival` at ORD — when it lands

This mirrors the departure board shape and gives everything needed to pair legs **without** fetching OKC’s departure board separately.

### Live verification (2026-08-31, UA, RapidAPI)

**4 FIDS calls:**

1. IAH departures 00:00–11:59  
2. IAH departures 12:00–23:59  
3. ORD arrivals 00:00–11:59  
4. ORD arrivals 12:00–23:59  

**Results:**

| Metric | Value |
|--------|-------|
| IAH departure destinations | 155 unique stations |
| ORD arrival origins | 239 unique stations |
| **Intersection** | **102 stations** |
| OKC in intersection? | **Yes** |

Sample intersection (first 20): ABQ, AMS, ANC, ASE, ATL, AUS, BHM, BJX, BNA, BOG, BOS, BWI, CDG, CHA, CHS, CLE, CLT, CMH, COS, CPH …

### OKC proof case

| Source | OKC→ORD UA flights found |
|--------|---------------------------|
| OKC departure board (full day) | 5 (including afternoon 13:30, 17:05, 17:45) |
| ORD arrival board (full day, origin OKC) | **Same 5 flights** — data is consistent |

**In-memory pairing (UA only, 60–360 min layover):**

| Station | Inbound IAH→X (UA) | Onward X→ORD (UA) | Pairs 60–360 min | Pairs ≥60 min |
|---------|-------------------|-------------------|------------------|---------------|
| **OKC** | 8 | 5 | **6** | 9 |
| DEN | 11 | 12 | 28 | 49 |
| STL | 5 | 10 | 8 | 12 |
| MCI | 5 | 7 | 7 | 11 |

**OKC would qualify as `IAH>OKC>ORD`** under the current 60–360 min rule if discovery used intersection — it was missed only because the old pipeline never checked OKC (rank 16, cap 8).

---

## Proposed algorithm

```
1. Fetch departure boards for each approved origin (2 × 12h windows each)
   → Set D: destinations X with inbound legs {IAH→X flights + times}

2. Fetch arrival boards for each approved destination (2 × 12h windows each)
   → Set A: origins X with onward legs {X→ORD flights + times}

3. Candidates X = D.destinations ∩ A.origins
   (minus same-city, dest itself, carrier/access exclusions)

4. For each X in Candidates (in memory, no extra FIDS):
   - Pair inbound IAH→X with onward X→ORD
   - Require onward.dep > inbound.arr + MIN_LAYOVER
   - Apply MAX_LAYOVER (or future standby window — see below)
   - Optional: detour ratio using existing geo cache

5. Emit GatewayBuild / ConnectionStrategySeed for every viable X
   → buildStrategyCatalog() → plan.strategies
   (still separate from deep scoreCount scoring)
```

This is the **FlightConnections mental model** (what cities connect) without building a persisted route graph.

---

## API cost analysis

### Current normal plan (approximate)

| Step | Calls |
|------|-------|
| IAH departure board (2 windows) | 2 |
| Top 8 hubs × `findRouteLegs` (2 windows each) | 16 |
| **Total FIDS tier-2** | **~18** |

Only **8** stations become strategies. OKC at rank 16 is never checked.

### Board intersection

| Step | Calls |
|------|-------|
| Origin departure boards (2 windows × N origins) | 2–4 |
| Destination arrival boards (2 windows × M dests) | 2–4 |
| Per-station onward | **0** |
| **Total FIDS tier-2** | **~4–8** |

Up to **102** intersecting stations can be timing-verified in memory.

For IAH→ORD with nearby=false, single origin + single dest: **4 calls** vs **18 calls**.

---

## What intersection does NOT replace

- **Deep scoring** (`scoreConnection`, GF8, availability boards) — still on a smaller `scoreCount` subset  
- **Detour / geo sanity** — still apply after intersection (cheap geo batch)  
- **Carrier / access filters** — still filter both leg sets  
- **Nonstop discovery** — unchanged (direct O→D board scan)  
- **GF8** — separate commercial itinerary source  

Intersection replaces only the **“does X→B exist?”** per-station FIDS fan-out.

---

## Implementation notes for Standbye

### 1. Add `fetchArrivalBoard()`

Mirror `fetchDepartureBoard()` in `aerodatabox.server.ts` with `direction=Arrival`, parsing `arrivals[]`.

### 2. Fix cache key to include direction

Current `fidsCacheKey()` is:

```
adb:fids:v2:{IATA}:{date}:{start}-{end}
```

Departure and arrival boards for the same window would **collide**. Extend to:

```
adb:fids:v2:{IATA}:{date}:{start}-{end}:{Departure|Arrival}
```

### 3. Wire into `findGateways()` or sibling

Rename conceptually to `findConnectionStrategiesViaBoardIntersection()`:

- Input: `origins[]`, `dests[]`, travel date, carrier filter  
- Output: `GatewayBuild[]` (or directly `ConnectionStrategySeed[]`)  
- Feed existing `buildStrategyCatalog()` — **PlanStrategy contract unchanged**

### 4. Cap strategy *display* vs discovery breadth

Intersection may yield 50–100+ viable X. Options:

- Return **all** actionable strategies in `plan.strategies` (Every Way There truth)  
- Still deep-score only top N for `plan.options` ranking  
- Order strategies by best scored option, then discovery order  

Product decision: breadth in `strategies[]` is the point of Every Way There.

### 5. Multi-origin / multi-dest

Already supported by plan scope:

- Union departure destinations from IAH + HOU boards  
- Union arrival origins from ORD + MDW boards  
- Intersect the unions  

Call count: `(2 × |origins|) + (2 × |dests|)` — still far below per-X onward.

---

## Sequencing / layover rule (future, separate PR)

Current rule: **60–360 minute** paired layover (commercial-style).

User feedback: standby travelers may accept **longer** ground time (e.g. 7 hours at OKC). That is a **viability rule change**, not a contract change:

- **Minimum** ground time — keep (realistic transfer)  
- **Maximum** — relax or replace with “same travel day” / “before last useful onward”  

Do **not** combine with intersection work in the same PR.

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Intersection includes irrelevant intl stations (AMS, CDG) | Existing detour + access filters; optional US-domestic prefilter for staff-travel MVP |
| 100+ strategies overwhelm UI | Frontend groups by path; backend truth is correct for Every Way There |
| Arrival board rate limits | Same retry/cache/rate-limit as departures; 4 calls is lighter than 18 |
| Schedule-only legs missing times | Same `toRouteLeg` / reject rules as today; skip X if no pairable times |
| Stale cache | Reuse `adbFidsTtlSeconds()` (~1h); separate cache keys per direction |

---

## Recommendation

**Proceed with board intersection as the next discovery-layer change.**

1. Keep PlanStrategy contract ✅  
2. Add arrival board client + direction-aware cache keys  
3. Replace per-station onward FIDS loop with intersection + in-memory pairing  
4. Feed all viable paths into `plan.strategies`; keep deep scoring budget separate  
5. Defer standby layover relaxation to a follow-up PR  

This directly addresses: *“Show me the realistic ways I can get there”* without the low-frequency stations losing a “most departures from IAH” contest before onward verification.

---

## Reproduce

```bash
AERODATABOX_RAPIDAPI_KEY=*** \
  bun scripts/test-board-intersection.ts
```

(See script for live intersection counts and OKC pairing proof.)

---

## Related docs

- `docs/plan-strategy-contract-report.md` — PlanStrategy implementation + OKC FAQ  
- `docs/every-way-there-backend-audit.md` — pre-implementation audit  
- PR #10 — PlanStrategy contract (keep)
