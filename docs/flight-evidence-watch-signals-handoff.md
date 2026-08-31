# Flight Evidence & Watch Signals — What Attaches to Every Flight

**Purpose:** Paste-ready handoff for the new repo. Covers the per-flight evidence stack (paid + free) and how Watch uses it without burning GF8 every cycle.

**Related:** `docs/cheap-watch-redesign.md`, `docs/domain-handoff-for-rork.md` §§7/10/13/14, flight-detail UI (old `/options/$optionId`)

---

## 1. The idea (locked)

Every ranked flight on a Plan carries **evidence**, not just a judgment label.

```text
Flight on Plan
  ├── Availability   ← booking board / loads (often paid GF8 path at build)
  ├── Operations     ← FREE: FAA + METAR/TAF (+ NWS on watch)
  ├── History        ← historical load/cancel patterns (cached where possible)
  ├── Recovery       ← later ways on the same Plan (computed)
  ├── Holiday ctx    ← FREE: nearby dest holiday (context, not “proof full”)
  └── Live presence  ← ADB status / FIDS on watch (paid but cacheable)
```

The flight detail screen you pasted (Favorable + Booking check / Operations / Backup runway + Add a load + More context) is the **UI of that evidence**. Clean-slate IA folds it under Home/Ways as **Flight detail**, not a separate Options product — but the **data model stays**.

---

## 2. Free vs paid (cost ideology)

| Signal | Source | Cost class | Used at build/rank | Used on quiet watch |
|--------|--------|------------|--------------------|---------------------|
| FAA NAS programs | FAA XML (free) | **Free** | Ops pillar | Env fingerprint → may force `rerank` |
| METAR / TAF | aviationweather.gov | **Free** | Ops pillar | Env fingerprint |
| NWS alerts | api.weather.gov | **Free** | (watch path) | Env fingerprint |
| Holidays | Nager.Date (cached by country-year) | **Free** | Context on plan/dest | Not a watch trigger alone |
| History / BTS-style | Internal history cache | Cheap / cached | History pillar | Not every cycle |
| FIDS departure board | AeroDataBox | **Paid**, **shared cache** by airport+date+window | Discovery / cancel pressure | Shared; prefer cache hit |
| Flight number status | AeroDataBox | **Paid**, cache if fresh | Lazy verify / watch | Primary presence |
| Google Flights (GF8) | RapidAPI | **Paid, expensive** | Build + **rerank only** | **Never on skip / notify-only** |
| Operator verify | ADB | **Paid, lazy** | Current flight / eligibility | Only if identity/eligibility needs it |
| Traveler load | Manual / screenshot | Vision $ only on upload | Local rescore **$0** GF8/ADB | N/A |

**Rule:** Watch prefers **free + cached** signals. Paid ADB status/FIDS only when cache miss. **GF8 only on `rerank`.**

---

## 3. What attaches at Plan build / full rank

For each candidate flight (nonstop or connection legs), ranking roughly does:

```text
1. Availability board (GF8 / booking-style) → availability pillar
2. operationsFor(origin, dest, date, depLocal)
     - if US FAA coverage → getFaaPrograms()
     - if ICAO known → getMetar + getTaf
     - coverage states: available | not_covered | unavailable
     - cancel pressure: earlier same-route cancels (ADB FIDS-derived) can worsen ops
3. historyFor(...) → history pillar (unknown if not covered — not fake “Normal”)
4. buildRecovery(later siblings) → recovery / “Backup runway”
5. holidayFor(dest, travelDate) → optional HolidayEvidence (±5 days)
6. scoreFromPillars + access friction → judgment (Favorable / Mixed / Riskier)
```

Persisted on the option (and shown on flight detail):

- `pillars[]` + `reasons[]` / headline  
- `evidence.conditions` (FAA/weather copy + coverage)  
- `evidence.history`  
- `evidence.holiday`  
- `evidence.recovery` (backup runway)  
- `evidence.availability` (+ later personal/network load)

**Coverage rule:** Missing FAA outside US = `not_covered`, not green “Strong ops.” Missing METAR = honest unavailable/unknown.

---

## 4. Holidays (free context)

```text
holidayFor(destIata, travelDate)
  → country from airport TZ
  → cached holiday list for country-year (Nager)
  → nearest holiday within 5 days
```

Product copy intent (locked):

> Major holidays can make normal historical demand less useful. Standbye treats this as **context**, not proof the flight will be full.

- Slow/broken holiday API → **null**, never block ranking.  
- Not enough alone to rerank a watch.

---

## 5. How Watch uses this stack (the logic you mean)

```text
Due watch
  → resolveAndPersistPlanLifecycle()          // advance/complete first
  → FREE env: FAA + METAR/TAF + NWS           // fingerprint
  → SHARED FIDS for airport/date/window       // cache or one ADB board
  → PRIMARY status (ADB) if cache stale       // presence / cancel / delay
  → reconcile number-status ↔ FIDS status
  → compare to previous WatchSignalState
       ├─ skip         → timestamps only; NO GF8; NO full rank
       ├─ notify-only  → gate/terminal etc.; NO GF8; NO full rank
       └─ rerank       → rankStandbyOptions (rebuild pillars w/ fresh boards)
```

### What free signals can do on watch

| Change | Outcome |
|--------|---------|
| FAA ground stop / delay program appears or worsens at plan origin (or hub on plan) | **`rerank`** |
| Weather band worsens (clear → watch → impact via METAR/TAF/NWS) | **`rerank`** if material |
| Env unchanged | Supports **`skip`** |
| Holiday alone | **Never** rerank |

### What ADB does on quiet cycles

| Fetch | When |
|-------|------|
| Shared FIDS | Warm/reuse by `fidsCacheKey(airport, date, window)` — many watches share one board |
| Primary status | Only if cache not fresh — **never `force: true` every cycle** |
| Operator verify | Lazy; not every recheck |

### What must NOT happen on quiet cycles

- `rankStandbyOptions` / GF8  
- Forced ADB status every 30 minutes  
- Inferring cancellation because a flight “fell out of ranking”

Cancellation alerts only on **status transition** into cancelled (see presence handoff).

---

## 6. Flight detail UI ↔ evidence map

Your screenshot blocks map to the stack:

| UI block | Evidence |
|----------|----------|
| ORD→LAX · UA1522 · times | Segment identity + sched |
| Favorable setup / Why this ranks | Judgment + headline from pillars |
| Booking check · Strong | Availability pillar (+ load if any) |
| Operations · Strong | FAA + weather evidence |
| Backup runway · Strong | Recovery pillar |
| Reported load / Add a load | Personal (then network) load → local rescore |
| More context / Route history | History + holiday + deeper ops |
| Your current plan | Current-flight commit |

**New IA:** same content, enter from Home (tap current) or Ways (tap row) → **Flight detail** under Home stack — not `/options` as a product noun.

---

## 7. Source module anchors (old repo)

| Concern | File |
|---------|------|
| Free FAA / METAR / TAF / NWS | `sources.server.ts` |
| Ops pillar assembly | `ranking.server.ts` → `operationsFor` |
| Holiday | `ranking.server.ts` → `holidayFor` (+ cache) |
| Coverage types | `coverage.ts` |
| Watch gather | `watch-signals.server.ts` → `gatherWatchSignals`, `environmentFingerprint` |
| Watch decide | `watch-signal-gate.ts` → `decideWatchOutcome` |
| FIDS key / window | `fids-cache-key.ts` |
| Status ↔ FIDS reconcile | `flight-status-reconcile.ts` / watch path |
| Full watch redesign | `docs/cheap-watch-redesign.md` |

---

## 8. Invariants (do not regress)

- [ ] Free ops/weather/holiday attach at rank time and show as evidence, not fake certainty  
- [ ] Missing coverage ≠ “Strong / Normal”  
- [ ] Holiday is context only  
- [ ] Quiet watch = free fingerprints + cached ADB; **no GF8**  
- [ ] Env deterioration (FAA/weather band) can trigger **`rerank`** without waiting for GF8 curiosity  
- [ ] Never `force` ADB status every cycle  
- [ ] Shared FIDS cache keyed by airport + date + **window**  
- [ ] Cancel from **status/board**, not ranking gaps  
- [ ] Load attach still **zero** GF8/ADB after save  

---

## 9. Prompt fragment for the new Cursor chat

```text
Read docs/flight-evidence-watch-signals-handoff.md.

Each flight on a Plan carries evidence pillars:
  availability, operations (FAA+weather free), history, recovery,
  optional holiday context, optional reported load.

Watch cycles:
  lifecycle first → free FAA/METAR/TAF/NWS fingerprints → shared FIDS →
  cached primary status → decide skip | notify-only | rerank.
GF8 / full rank only on rerank.
Flight detail UI shows this evidence (from Home/Ways), including Add a load.

Do not invent boarding odds. Do not treat missing weather/FAA as Strong.
List every file you change.
```

---

## 10. One-line summary

**Every flight gets free ops/weather (+ holiday context) and paid boards/status only when needed; Watch fingerprints free signals first and only spends GF8 on `rerank`. Flight detail is how the traveler sees that evidence.**
