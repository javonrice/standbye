# Cheap Watch Redesign

> Plan only — do not treat this as implemented.
> Branch: `cursor/cheap-watch-redesign-plan-98c4`
> Baseline: live architecture probes against current `main` (2026-08-29).
> Revised: separate notify vs rerank; distance-aware safety refresh; no cohort orchestration in v1; **stop after S0–S4 and measure**.

## Goal

Redesign Standbye Watch so quiet 30-minute cycles check free/shared signals first and only spend AeroDataBox / Google Flights when a Plan actually needs reassessment.

Preserve current intelligence (ops, cancel pressure, availability, eligibility events). Change **when** Standbye spends money — not what Standbye knows.

## Baseline (already proven)

| Probe | Result | Implication |
|---|---|---|
| FIDS cancellation signal | PASS | Keep using airport boards for cancel pressure |
| Identical-key FIDS reuse | PASS, keys buggy | Fix key/window identity before gating |
| Primary flight status | PASS | Keep number-status for primary truth |
| No-change trigger gating | FAIL | Main rewrite target for S0–S4 |
| Cancel impact on nonstops | PASS w/ caveats | Keep; do not weaken |
| Watch unit economics | FAIL | First milestone success = quiet watches ≪ 100× paid calls |

## Conflicts in current code

These must be fixed or they will break the design:

1. **`recheckWatch` always calls `rankStandbyOptions`** after status — no pre-rank gate (`src/lib/aircue/plan.server.ts`).
2. **`getWatchStatus` always passes `force: true`**, and `cachedCall` skips fresh cache when `force` is set → every cycle can burn 2 ADB units (`flight-provider.server.ts`, `aerodatabox.server.ts`).
3. **FIDS key split:** schedule uses `departures:00:00` / `departures:12:00` (`route-search.server.ts`); cancel path uses default `"departures"` and **omits the actual window from the key** (`getEarlierRouteCancellations`) → wrong/stale 12h slice can be reused for 1h.
4. **`AdbFlight.status` is dropped** in `toRouteLeg` / `toResolution` / `OptionSegment` — board cancel truth never survives into internal flight models.
5. **Cancel pressure only in `scoreLeg` (nonstops)** — connections/GF8 candidates ignore earlier cancels (leave ranking behavior intact in S0–S4; do not expand scope just to spend less).
6. **Operator verify defaults / `force: true` every trusted recheck** (`operator-verify.server.ts`).
7. **NWS exists but is never called**; ranking only uses FAA + METAR/TAF.
8. **ADB budget hardcoded** (`MONTHLY_UNIT_BUDGET = 600`).
9. Cron processes watches independently — fine for v1. Shared cache is how many users share one board; **airport-wide cohort orchestration is deferred** (S5+).

---

## Watch cycle outcomes (three, not two)

Every `recheckWatch` ends in exactly one of:

| Outcome | Meaning | Paid work |
|---|---|---|
| **`skip`** | Nothing notify-worthy or rerank-worthy changed; safety refresh not due | No `rankStandbyOptions`, no GF8, no forced operator verify; reuse fresh caches |
| **`notify-only`** | Useful traveler update that does **not** change Plan ranking inputs | May record a Watch event / bump unseen; **no** rank, **no** GF8, **no** forced operator verify |
| **`rerank`** | Plan needs reassessment | Run normal `rankStandbyOptions` (GF8 as today inside ranking) for **this Plan only**; operator verify only if eligibility/primary identity requires it |

Instrumentation must log this outcome on every cycle (see §8).

---

## 1. Exact files / functions to change (S0–S4 first)

### Core Watch orchestration

- `src/lib/aircue/plan.server.ts` — `recheckWatch`, `beginWatch`; signal gather + gate **before** `rankStandbyOptions`; per-Watch decide `skip | notify-only | rerank`
- `src/routes/api/public/run-watches.ts` — keep simple due-watch loop for v1; rely on shared `source_cache` rather than airport cohort fan-out

### ADB / FIDS / status

- `src/lib/aircue/aerodatabox.server.ts` — `cachedCall`, `fetchDepartureBoard`, `fetchFlightLegs` / `fetchFlightStatus`; env-driven budget/rate/TTL; stop treating Watch as automatic `force`
- `src/lib/aircue/flight-provider.server.ts` — `getWatchStatus`, `getEarlierRouteCancellations`, `toFlightStatus`, `toResolution`
- `src/lib/aircue/route-search.server.ts` — `toRouteLeg`; board windows use the shared FIDS key helper

### Signals / ranking

- `src/lib/aircue/sources.server.ts` — wire `getNwsAlerts` into free environment fingerprint used by the gate
- `src/lib/aircue/ranking.server.ts` — leave scoring weights/behavior alone in S0–S4; may accept prefetched FIDS summary later without changing judgment logic
- `src/lib/aircue/operator-verify.server.ts` — TTL reuse; no default force-on-every-Watch

### State / events

- `src/lib/aircue/plan-watch-events.server.ts` — extend snapshot with `WatchSignalState`; allow notify-only events (e.g. gate change) without plan change detection that implies rerank
- `src/lib/aircue/watch-flight-state.server.ts` — status classification + FIDS/number-status reconciliation
- New module: `src/lib/aircue/watch-signals.server.ts` — gather signals, compare, return `{ outcome, trigger, notifyEvents? }`

### Types / tests

- `src/lib/aircue/standby.ts` — optional status fields where needed so status is not dropped
- Tests under `src/lib/aircue/__tests__/` — FIDS keys, gate outcomes, economics ledger, reconciliation

**Deferred (S5+):** airport-wide cohort orchestrator in cron; connection cancel-pressure expansion; heavier schema columns.

---

## 2. Proposed Watch flow (plain English) — first release

1. Cron finds a due Watch (unchanged simple loop).
2. Read **free** signals: FAA, METAR/TAF, NWS, plus stored Plan/Watch state.
3. Get **shared** FIDS for that airport/date/window (cache hit if any other caller already warmed the same key).
4. Primary flight: reuse cached ADB status if fresh; otherwise fetch once.
5. Reconcile primary status with FIDS when needed (§6).
6. Compare to last Watch signal snapshot.
7. Decide outcome:
   - **`skip`** → update `last_checked_at` / `next_check_at` / signal snapshot timestamps only. Stop.
   - **`notify-only`** → record notification event(s), update signal snapshot (gate/terminal etc.), advance check time. **Do not** call `rankStandbyOptions` or GF8.
   - **`rerank`** → run normal ranking for **this Plan**, preserve existing Standbye intelligence, operator-verify only if needed, save options + events + signal snapshot.

```text
Due watch
  → free signals (FAA / weather / NWS / stored state)
  → shared FIDS (cache or one ADB call for that window)
  → primary status (cache if fresh, else fetch)
  → reconcile
  → compare to last signal snapshot
       ├─ skip         → stop (cheap)
       ├─ notify-only  → Watch event only, no rank / no GF8
       └─ rerank       → rankStandbyOptions for this Plan only
```

Quiet path: free/cached signals + maybe shared FIDS + maybe status. **No GF8. No full rank. No forced operator verify.**

---

## 3. Notify-worthy vs rerank-worthy rules

### Notify-only (do **not** rerank / do **not** call GF8)

Versus previous signal snapshot:

- Gate changes when both old and new gate are known and differ
- Terminal changes when both old and new terminal are known and differ
- Non-material primary text/status noise that does not meet rerank thresholds below
- `boardConflict` flag flips without a reconciled cancellation (debug-quality signal; notify at most once)

These remain useful Watch updates for the traveler. They must **not** open Google Flights.

### Rerank-worthy (reassess this Plan)

Versus previous signal snapshot:

**A. Primary flight truth**

- Classified state change among: `operating | delayed | cancelled | departed | unknown` when the change is material (especially into/out of `cancelled`, or into `departed`)
- After reconciliation, primary becomes cancelled (or clears cancellation)
- Scheduled/revised departure time changes by **≥ 15 minutes** (meaningful delay / retiming)

**B. Cancellation pressure** (same origin + route/carrier context as today’s nonstop scoring)

- Count of earlier same-route/carrier cancellations for the Plan’s nonstop candidates **increases**
- Or the set of cancelled flight numbers for that pressure window gains new flights

**C. Free ops environment**

- FAA: new/changed ground stop, ground delay, or airport-level program affecting Plan origin (or a hub already on the Plan)
- Weather: METAR/TAF/NWS severity band crosses into a material deterioration that existing `operationsFor` heuristics would care about

**D. Plan structure safety**

- Stored primary option id vanished / marked non-current from a prior trusted sync

**E. Scheduled availability / safety refresh** (distance-aware — see §3.1)

- Refresh due per policy below → rerank **this** Plan once, then quiet again until the next due window or a real disruption

### Never enough alone to rerank

- Cache TTL expiry alone
- Identical FIDS refetch
- Coverage gaps / missing FAA internationally
- Ops copy wording changes with same underlying counts/states
- Operator verify still unverified
- Gate/terminal-only changes (notify-only)

### 3.1 Distance-aware safety / availability refresh (not a flat 6 hours)

**Do not hardcode a universal 6-hour full rerank.** Cadence is configurable and based on hours until primary (or Plan travel-day) departure.

**Starting policy (must be tuned from measured usage; not claimed as final truth):**

| Hours until departure (`H`) | Suggested refresh interval |
|---|---|
| `H > 72` | every **24h** |
| `24 < H ≤ 72` | every **12h** |
| `6 < H ≤ 24` | every **6h** |
| `H ≤ 6` | every **3h** |
| Real disruption (rerank-worthy A–D) | **immediate** reassessment on that cycle |

Env/config knobs (names indicative):

- `AIRCUE_WATCH_REFRESH_GT_72H_HOURS` (default 24)
- `AIRCUE_WATCH_REFRESH_24_72H_HOURS` (default 12)
- `AIRCUE_WATCH_REFRESH_6_24H_HOURS` (default 6)
- `AIRCUE_WATCH_REFRESH_LE_6H_HOURS` (default 3)

Store `nextSafetyRefreshAt` on the Watch signal state; recompute when primary departure time changes after a rerank.

---

## 4. Shared FIDS caching key

**Canonical key:**

```text
adb:fids:v2:{IATA}:{YYYY-MM-DD}:{HH:MM}-{HH:MM}
```

Examples:

- Morning schedule: `adb:fids:v2:ORD:2026-08-29:00:00-11:59`
- Afternoon: `adb:fids:v2:ORD:2026-08-29:12:00-23:59`
- Custom cancel lookback: `adb:fids:v2:ORD:2026-08-29:03:55-14:55`

Rules:

- Key **must include** the exact window start/end passed to ADB.
- One helper builds schedule and cancel requests so identical windows share one cache object.
- Different windows never collide.
- Prefer fixed day halves when the lookback fits; custom windows still keyed exactly.
- TTL ~1h (env-tunable). No per-user keys.
- Many Watches share results **through this cache**, not through a separate cohort job in v1.

---

## 5. Primary-flight status caching

| Mode | Cache key | TTL | When used |
|---|---|---|---|
| Normal / Watch | `adb:status:{FLIGHT}:{date}:watch` | **20 min** (env-overridable) | Default Watch path |
| Resolve / non-watch | `adb:status:{FLIGHT}:{date}` | 24h | Initial resolve |

Rules:

- Watch **reads cache if fresh**. No automatic `force: true`.
- `force` only when TTL expired, manual user refresh, or an explicit safety/rerank path needs upstream truth.
- Identical flight/date lookups share one cache entry across Watches.

---

## 6. FIDS cancelled vs number-status `Unknown` reconciliation

Deterministic rule for the **watched primary** (same origin/dest/date/flight):

| Number-status | FIDS row for that flight | Watch treats as |
|---|---|---|
| cancelled | any | **cancelled** (status wins) |
| operating / delayed / departed | cancelled / CanceledUncertain | **status wins** for primary; record `boardConflict: true`; do **not** emit `flight_cancelled` from board alone |
| Unknown / missing | explicit hard cancelled | **cancelled_from_board** → cancelled for gating + cancellation event |
| Unknown / missing | CanceledUncertain | keep primary `unknown`; include in cancel-pressure set for ops |
| Unknown / missing | operating | operating/unknown as today |

**Pressure vs primary:** FIDS is authoritative for **earlier-cancellation pressure**. Number-status is authoritative for **this traveler’s flight** unless status is unknown/missing and FIDS shows a hard cancel.

---

## 7. Data / state stored per Watch

Extend `watch_plans.snapshot` jsonb with versioned `signalState`:

```ts
signalState: {
  v: 1;
  checkedAt: string;
  nextSafetyRefreshAt: string;
  primary: {
    flightNumber: string;
    origin: string;
    dest: string;
    state: "operating" | "delayed" | "cancelled" | "departed" | "unknown";
    schedDepLocal?: string | null;
    revisedDepLocal?: string | null;
    gate?: string | null;
    terminal?: string | null;
    boardConflict?: boolean;
    source: "status" | "fids" | "reconciled";
  };
  cancelPressure: {
    origin: string;
    date: string;
    windowKey: string;
    byRoute: Record<string /* carrier:dest */, { count: number; flightNumbers: string[] }>;
  };
  environment: {
    faaFingerprint: string;
    weatherBand: "clear" | "watch" | "impact";
    weatherFingerprint: string;
  };
  lastRankAt: string | null;
  lastRankTrigger: string | null;
  lastOutcome: "skip" | "notify-only" | "rerank";
}
```

Keep existing post-rank snapshot fields for plan-change events. Prefer jsonb embedding first; add DB columns only if ops need them later.

---

## 8. Metrics / logging for API economics

Per Watch cycle:

```ts
watch_cycle: {
  watchId, planId,
  outcome: "skip" | "notify-only" | "rerank",
  trigger?,           // e.g. gate_changed | primary_cancelled | cancel_pressure | faa | weather | safety_refresh
  adbUnits,
  adbEndpoints: string[],
  fidsCacheHit: boolean,
  statusCacheHit: boolean,
  gf8Calls: number,
  rankingRan: boolean,
  operatorVerifyRan: boolean,
  durationMs: number
}
```

Also continue `api_usage_log` for ADB units by endpoint.

**First-milestone success ledger:** 100 quiet Watches × 2 cycles → GF8 from Watch ≈ 0, full reranks ≈ 0, FIDS upstream ≈ unique airport/date/windows, status heavily cached.

---

## 9. Migration / database / config

### Minimum for S0–S4

- No required new tables — write `signalState` into existing `watch_plans.snapshot`.

### Optional later

- `signal_hash`, `last_rank_at`, `next_safety_refresh_at` columns if needed for ops/query.

### Env (architecture must not assume 600-unit Basic)

| Env var | Default (starting point) |
|---|---|
| `AERODATABOX_MONTHLY_UNIT_BUDGET` | 600 |
| `AERODATABOX_SOFT_STOP_REMAINING` | 50 |
| `AERODATABOX_MIN_INTERVAL_MS` | 1000 |
| `AIRCUE_WATCH_STATUS_TTL_SECONDS` | 1200 |
| `AIRCUE_FIDS_TTL_SECONDS` | 3600 |
| `AIRCUE_WATCH_REFRESH_GT_72H_HOURS` | 24 |
| `AIRCUE_WATCH_REFRESH_24_72H_HOURS` | 12 |
| `AIRCUE_WATCH_REFRESH_6_24H_HOURS` | 6 |
| `AIRCUE_WATCH_REFRESH_LE_6H_HOURS` | 3 |

---

## 10. Staged implementation order

### First build milestone — implement, then **STOP AND TEST**

| Stage | What | Done means |
|---|---|---|
| **S0** | Env-driven ADB budget, soft-stop, rate limit, FIDS TTL, Watch status TTL, distance-aware refresh interval config | No hardcoded Basic-only economics |
| **S1** | Canonical FIDS cache keys including exact window; schedule + cancel paths share identical keys | Different windows never collide; identical windows reuse |
| **S2** | Preserve ADB status through internal models; deterministic FIDS ↔ number-status reconciliation; do not weaken ranking | Status no longer dropped; reconciliation table covered by tests |
| **S3** | Remove blind `force=true` Watch behavior; reuse fresh primary status; shared status cache; no repeated operator verify when nothing requires it | Quiet cycles stop burning forced status/verify |
| **S4** | `signalState` + gate **before** `rankStandbyOptions`: gather free/shared/narrow signals; decide `skip` / `notify-only` / `rerank`; instrument every cycle | Nothing meaningful → STOP (no rank, no GF8, no forced verify) |

**After S0–S4: stop development and run the acceptance tests in §11.** Do not start S5–S7 until those pass and the economics look right.

### Later — only after S0–S4 tests pass

| Stage | What | Why later |
|---|---|---|
| **S5** | Optional airport-window cohort warm/orchestration optimizations (not required for correctness if shared cache works) | Measure first; avoid overbuilding |
| **S6** | Further operator-verify / connection cancel-pressure refinements if gaps remain | Incremental |
| **S7** | Broader CI live-probe harness / dashboards | Lock long-term |

**Do not ship S4 without S1** — gating on wrong FIDS windows will skip or fire incorrectly.

---

## 11. Acceptance test (first milestone)

### Focus target

**100 quiet Watches × 2 cycles**

Expected:

- ≈ **zero** GF8 calls caused by Watch
- ≈ **zero** full reranks (`outcome=rerank` count ≈ 0)
- FIDS upstream scales with **unique airport/date/windows**, not user count
- Primary-status upstream heavily reduced via cache / dedupe
- Cycle outcomes are almost all `skip` (or rare `notify-only` if fixtures include gate noise)

### Disruption target

Introduce/fixture one meaningful cancellation, FAA/weather change, or primary-flight change on a subset of Watches.

Expected:

- Affected Watch(es) get `outcome=rerank` and call ranking/GF8 as reassessment requires
- Unaffected Watches stay `skip` (or unrelated `notify-only`)
- Cancellation pressure still moves Plan ops correctly for affected Plans
- Gate/terminal-only fixture produces `notify-only`, **not** rerank

### Unit / integration (prefer fixtures; minimize live Basic ADB)

- FIDS key identity and non-collision
- Fresh status cache → no upstream
- Identical signalState → `skip` (no rank / GF8 / forced verify)
- Gate change only → `notify-only`
- Primary cancel / delay ≥15m / cancel pressure↑ / FAA / weather / safety-due → `rerank`
- Reconciliation table cases
- Existing regressions: Plan create, ranking, Backup Runway, gateways/connections, Escape, operator/access, FAA/weather cues, Watch cancel-once / incomplete-rank preserve / immutable access snapshot

### Live calls

Use live ADB/GF8 only where necessary to prove provider behavior after a paid tier is available. Do not burn remaining Basic units on repeatable economics tests.

---

## Locked product decisions (revised)

- **Notify ≠ rerank:** gate/terminal alone never open GF8 or ranking.
- **Safety refresh:** distance-to-departure bands via env; starting policy above; tune from measurement — no “6 hours forever” claim.
- **Cohort orchestration:** deferred. Shared FIDS/status caching is enough for v1; each due Watch decides for its own Plan.
- **First cancel-pressure scope for gating:** same as today’s nonstop scoring.
- **NWS:** include in free environment fingerprint for the gate.
- **Schema:** `signalState` inside existing `snapshot` jsonb first.
- **Build rule:** S0–S4 → test → only then S5–S7.

## Success statement

Standbye keeps the same brain. Watch becomes a scheduler with three clear outcomes — **skip**, **notify-only**, **rerank** — so quiet travelers cost almost nothing, disruptions still get a full reassessment, and Google Flights stays a tool for reassessment rather than a heartbeat.
