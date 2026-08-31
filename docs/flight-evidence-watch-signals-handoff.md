# Flight Evidence & Watch Signals — What Attaches to Every Flight

**Purpose:** Paste-ready handoff for the new repo. Covers the per-flight evidence stack (paid + free), how Watch uses it without burning GF8 every cycle, and **where Flight detail sits in the clean-slate wireframe**.

**Related:** `docs/cheap-watch-redesign.md`, `docs/domain-handoff-for-rork.md` §§7/10/13/14/20, `docs/ui-wireframe-function-map.md`, `docs/load-ideology-handoff.md`

---

## 0. Where this sits in the wireframe flow

### Function ID

| # | Job | Screen | Purpose |
|---|-----|--------|---------|
| **F10** | Explain this flight | **Flight detail** | Show attached evidence (pillars, holiday, load CTA, deeper context) |

Not a tab. Not an “Options” product. Plan-scoped under **Home**.

### Route (suggested)

```text
/(app)/home/                    ← F3 Current Plan
/(app)/home/ways                ← F4
/(app)/home/flight/:flightId    ← F10 Flight detail  ← THIS DOC
/(app)/home/load                ← F6 (also reachable from F10 “Add a load”)
/(app)/home/activity            ← F7
```

Do **not** revive top-level `/options/:id` as a product noun. Same screen, Home stack ownership.

### How the traveler gets here

```text
HOME (F3) Current Plan
  │
  ├─ tap the current flight block ──────────────► FLIGHT DETAIL (F10)
  │                                                 │
  │                                                 ├─ Add a load ──► Load (F6)
  │                                                 ├─ Make current (if not current) ──► F5
  │                                                 └─ Back ──► Home or Ways
  │
  └─ [See other ways] ──► WAYS (F4)
                            │
                            ├─ tap CURRENT or STILL OPEN / PASSED row ──► FLIGHT DETAIL (F10)
                            └─ [Make this current] sheet (F5) may open from F10 too
```

### What Home shows vs what F10 shows

| Surface | Shows | Does not show |
|---------|-------|---------------|
| **Home (F3)** | One flight: number, times, countdown, judgment, **one** why line, watching | Full pillar grid, holiday essay, history, load form |
| **Flight detail (F10)** | Full evidence for **that** flight | Dashboard of all flights; separate Updates tab |

Home stays one composition. F10 is where AeroDataBox / free weather / holiday / backup runway / load entry live as traveler-facing blocks.

### Wireframe (F10)

```text
┌─────────────────────────────────────┐
│  ←  ORD → LAX                       │  back to Home or Ways
│                                     │
│  UA  ·  UA1522                      │
│  Aug 31                             │
│                                     │
│  ORD  12:40 PM  Departs             │
│  LAX   3:05 PM  Arrives             │
│  Nonstop · times local              │
│  checked … ago                      │
│                                     │
│  🙂 Favorable setup                 │
│  Why this ranks here                │
│                                     │
│  Booking check      Strong          │  ← availability (+ load if any)
│  Operations         Strong          │  ← FREE FAA + weather
│  Backup runway      Strong          │  ← recovery
│                                     │
│  Reported load                      │
│  No load yet…                       │
│  [ Add a load ]                     │  → F6
│                                     │
│  More context                       │  holiday / history / weather detail
│  Route history                      │
│                                     │
│  [ Make this current ]              │  if not already current (F5)
│  or  ✓ Your current plan            │
└─────────────────────────────────────┘
```

### Tab selection

While on F10, bottom tab stays **Home** (Plan work), never Plans.

### Build order note

After Current Plan (F3) and Ways (F4), add **F10 Flight detail** before or with Load (F6) — Load can open from F10’s “Add a load.” Evidence can be mocked at first; free ops/holiday + paid status wiring follows this same screen.

### Flow diagram (full context)

```text
Splash → Onboarding → HOME (F3)
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
       Ways(F4)    Load(F6)      Activity(F7)
         │              ▲
         │              │
         └────► F10 Flight detail ──┘
                  │
                  ├─ evidence: avail / ops(weather+FAA) / recovery / holiday / history
                  ├─ watch presence updates “checked …” + cancel/delay truth
                  └─ Add a load → F6 → local rescore (no GF8)
```

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

Your screenshot blocks map to the stack — and to **F10** in §0:

| UI block | Evidence | Wireframe |
|----------|----------|-----------|
| ORD→LAX · UA1522 · times | Segment identity + sched | F10 hero |
| Favorable setup / Why this ranks | Judgment + headline from pillars | F10 |
| Booking check · Strong | Availability pillar (+ load if any) | F10 |
| Operations · Strong | FAA + weather evidence | F10 |
| Backup runway · Strong | Recovery pillar | F10 |
| Reported load / Add a load | Personal (then network) load → F6 | F10 → F6 |
| More context / Route history | History + holiday + deeper ops | F10 |
| Your current plan | Current-flight commit | F10 / F5 |

**Enter:** tap current on Home (F3) or tap a Ways row (F4).  
**Tab:** Home. **Not** a top-level Options app.

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
Read docs/flight-evidence-watch-signals-handoff.md (§0 wireframe + evidence stack).

Add F10 Flight detail under the Home stack:
  home/flight/:flightId
Enter from: tap current on Home, or tap a Ways row.
Show pillars (booking / operations / backup runway), holiday/history context,
Add a load → existing Load flow, Make current if needed.
Tab highlight stays Home.

Each flight carries evidence:
  availability, operations (FAA+weather free), history, recovery,
  optional holiday context, optional reported load.

Watch cycles:
  lifecycle first → free FAA/METAR/TAF/NWS fingerprints → shared FIDS →
  cached primary status → decide skip | notify-only | rerank.
GF8 / full rank only on rerank.

Do not invent boarding odds. Do not treat missing weather/FAA as Strong.
Do not create a top-level Options tab or /options product.
List every file you change.
```

---

## 10. One-line summary

**Every flight gets free ops/weather (+ holiday context) and paid boards/status only when needed; Watch fingerprints free signals first and only spends GF8 on `rerank`. Flight detail is how the traveler sees that evidence.**
