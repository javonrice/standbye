# Cheap Watch Redesign

> Plan only — do not treat this as implemented.
> Branch: `cursor/cheap-watch-redesign-plan-98c4`
> Baseline: live architecture probes against current `main` (2026-08-29).

## Goal

Redesign Standbye Watch so quiet 30-minute cycles check free/shared signals first and only spend AeroDataBox / Google Flights on meaningful changes or a narrow safety refresh.

Preserve current intelligence (ops, cancel pressure, availability, eligibility events). Make Watch smart about **when** it spends money.

## Baseline (already proven)

| Probe | Result | Implication |
|---|---|---|
| FIDS cancellation signal | PASS | Keep using airport boards for cancel pressure |
| Identical-key FIDS reuse | PASS, keys buggy | Fix key/window identity before gating |
| Primary flight status | PASS | Keep number-status for primary truth |
| No-change trigger gating | FAIL | Main rewrite target |
| Cancel impact on nonstops | PASS w/ caveats | Keep; extend carefully |
| Watch unit economics | FAIL | Success = quiet watches ≪ 100× paid calls |

## Conflicts in current code

These must be fixed or they will break the design:

1. **`recheckWatch` always calls `rankStandbyOptions`** after status — no pre-rank gate (`src/lib/aircue/plan.server.ts`).
2. **`getWatchStatus` always passes `force: true`**, and `cachedCall` skips fresh cache when `force` is set → every cycle can burn 2 ADB units (`flight-provider.server.ts`, `aerodatabox.server.ts`).
3. **FIDS key split:** schedule uses `departures:00:00` / `departures:12:00` (`route-search.server.ts`); cancel path uses default `"departures"` and **omits the actual window from the key** (`getEarlierRouteCancellations`) → wrong/stale 12h slice can be reused for 1h.
4. **`AdbFlight.status` is dropped** in `toRouteLeg` / `toResolution` / `OptionSegment` — board cancel truth never survives into internal flight models.
5. **Cancel pressure only in `scoreLeg` (nonstops)** — connections/GF8 candidates ignore earlier cancels.
6. **Operator verify defaults / `force: true` every trusted recheck** (`operator-verify.server.ts`).
7. **NWS exists but is never called**; ranking only uses FAA + METAR/TAF.
8. **ADB budget hardcoded** (`MONTHLY_UNIT_BUDGET = 600`).
9. **Cron processes watches independently** (`run-watches.ts`) — no “one FIDS fetch serves a cohort” orchestration beyond `source_cache` luck.

---

## 1. Exact files / functions to change

### Core Watch orchestration

- `src/lib/aircue/plan.server.ts` — `recheckWatch`, `beginWatch`; add pre-rank signal gather + gate; cohort-aware rerank entry
- `src/routes/api/public/run-watches.ts` — optional batching by airport/date so one FIDS warm serves many due watches in the same cron tick

### ADB / FIDS / status

- `src/lib/aircue/aerodatabox.server.ts` — `cachedCall`, `fetchDepartureBoard`, `fetchFlightLegs` / `fetchFlightStatus`; env-driven budget/rate limits; stop treating Watch as automatic `force`
- `src/lib/aircue/flight-provider.server.ts` — `getWatchStatus`, `getEarlierRouteCancellations`, `toFlightStatus`, `toResolution`
- `src/lib/aircue/route-search.server.ts` — `toRouteLeg`, board window suffix → shared key helper

### Signals / ranking (preserve intelligence, wire free sources)

- `src/lib/aircue/sources.server.ts` — use `getNwsAlerts` from ops path
- `src/lib/aircue/ranking.server.ts` — `operationsFor`, `scoreLeg` (and later connection path for cancel pressure consistency); accept prefetched shared FIDS summary where possible
- `src/lib/aircue/operator-verify.server.ts` — TTL reuse; no default force-on-Watch

### State / events

- `src/lib/aircue/plan-watch-events.server.ts` — extend snapshot with `WatchSignalState`
- `src/lib/aircue/watch-flight-state.server.ts` — status classification + FIDS/number-status reconciliation helper
- New module: `src/lib/aircue/watch-signals.server.ts` — gather cheap/shared signals, hash/compare, decide `skip | refresh_status | rerank_plan | rerank_cohort`

### Types / persistence

- `src/lib/aircue/standby.ts` — optional `status` on segment/leg-facing types
- Supabase migration for signal-state fields (below)
- Tests under `src/lib/aircue/__tests__/` — FIDS keys, gate, economics ledger, reconciliation

---

## 2. Proposed Watch flow (plain English)

1. Cron finds a due Watch.
2. Read **free** signals first: FAA, METAR/TAF, NWS, plus stored Plan/Watch state.
3. Get the **shared** FIDS board for that airport/date/window (cache hit if another Plan already warmed it).
4. For the primary flight: reuse cached ADB status if still fresh; otherwise fetch once.
5. Reconcile primary status with FIDS when needed (see §6).
6. Compare everything to the last Watch signal snapshot.
7. **If nothing meaningful changed (and safety refresh not due):** update timestamps only. Stop. No ranking, no Google Flights, no forced operator verify.
8. **If something meaningful changed:** rerank only the affected Plan(s). Google Flights is a reassessment tool, not a heartbeat.
9. Operator verify only when primary identity/eligibility actually needs it.
10. Save options/events and the new signal snapshot.

```text
Due watch
  → free signals (FAA / weather / NWS / stored state)
  → shared FIDS (cache or one ADB call)
  → primary status (cache if fresh, else fetch)
  → reconcile
  → compare to last signal snapshot
       ├─ no change → stop (cheap)
       ├─ primary-only change → rerank that Plan
       └─ airport/weather/FIDS cohort change → rerank affected Plans
            → GF8 + rankStandbyOptions for those Plans only
            → operator verify if needed
            → save snapshot
```

Quiet path spends: free weather/FAA (cached), maybe shared FIDS if cold, maybe primary status if TTL expired. **No GF8. No full rank. No forced operator verify.**

---

## 3. Exact definition of “meaningful change”

A Watch cycle **reranks** only if one or more of these are true versus the stored signal snapshot:

### A. Primary flight truth

- Classified state changes among: `operating | delayed | cancelled | departed | unknown`
- After reconciliation, primary becomes cancelled (or clears cancellation)
- Scheduled/revised departure time changes by **≥ 15 minutes**
- Gate or terminal changes when both old and new values are non-null and differ

### B. Cancellation pressure (same origin + route/carrier context as the Plan’s realistic options)

- Count of earlier same-route/carrier cancellations for the Plan’s nonstop candidates **increases**
- Or the set of cancelled flight numbers for that pressure window changes (additions), not merely reordering

### C. Free ops environment

- FAA: new/changed ground stop, ground delay, or airport-level program affecting Plan origin (or connection hub already on the Plan)
- Weather: METAR/TAF/NWS severity band crosses threshold that today’s `operationsFor` would treat as material. Reuse existing ops heuristics; do not invent a second weather brain.

### D. Plan structure drift already in snapshot

- Stored primary option id vanished / marked non-current from a prior trusted sync (safety)

### E. Periodic safety refresh (narrow)

- `safety_refresh_due`: **every 6 hours** since last GF8/rank for that Plan (env-overridable). Purpose: catch sellable-board / availability drift FAA won’t show. Still one Plan at a time, not a global GF8 storm.

### Not meaningful (do not rerank)

- Cache TTL expiry alone
- Identical FIDS payload refetch
- Coverage gaps / missing FAA for international
- Ops text wording changes with same underlying counts/states
- Operator verify “still unverified”

---

## 4. Shared FIDS caching key

**Canonical key:**

```text
adb:fids:v2:{IATA}:{YYYY-MM-DD}:{HH:MM}-{HH:MM}
```

Examples:

- Morning schedule: `adb:fids:v2:ORD:2026-08-29:00:00-11:59`
- Afternoon: `adb:fids:v2:ORD:2026-08-29:12:00-23:59`
- Cancel lookback for a 14:55 local departure (11h back → 03:55–14:55): `adb:fids:v2:ORD:2026-08-29:03:55-14:55`

Rules:

- Key **must include** the exact window start/end passed to ADB.
- One helper builds both schedule and cancel requests so they cannot invent different suffixes for the same window.
- Prefer **fixed day halves** (`00:00-11:59`, `12:00-23:59`) for cancel pressure when the lookback fits inside a half; only use a custom window when necessary — and still key by that exact window.
- TTL stays ~1h (env-tunable). No per-user keys.
- Cron should warm once per due airport/window, then all watches read cache.

---

## 5. Primary-flight status caching

| Mode | Cache key | TTL | When used |
|---|---|---|---|
| Normal / Watch | `adb:status:{FLIGHT}:{date}:watch` | **20 min** (`WATCH_STATUS_TTL_SECONDS`) | Default Watch path |
| Resolve / non-watch | `adb:status:{FLIGHT}:{date}` | 24h | Initial resolve |

Rules:

- Watch **reads cache if fresh**. No automatic `force: true`.
- `force` only when: TTL expired, manual user refresh, or safety refresh explicitly needs upstream truth.
- Same flight number/date across many watches shares one cache entry (already true if keys match).
- Cron batching: dedupe status fetches by `{flight, date, origin, dest}` within a tick.

---

## 6. FIDS cancelled vs number-status `Unknown` reconciliation

Deterministic rule for the **watched primary** (same origin/dest/date/flight):

| Number-status | FIDS row for that flight | Watch treats as |
|---|---|---|
| cancelled | any | **cancelled** (status wins) |
| operating / delayed / departed | cancelled / CanceledUncertain | **status wins** for primary identity; record `boardConflict: true` in signal state — do **not** emit `flight_cancelled` from board alone |
| Unknown / missing | explicit cancelled (not merely uncertain) | **cancelled_from_board** → treat as cancelled for gating + user cancellation event |
| Unknown / missing | CanceledUncertain | keep primary `unknown`; include flight in cancel-pressure set for ops |
| Unknown / missing | operating | operating/unknown as today |

**Pressure vs primary:** FIDS is authoritative for **earlier-cancellation pressure**. Number-status is authoritative for **this traveler’s flight** unless status is unknown/missing and FIDS shows a hard cancel.

---

## 7. Data / state stored per Watch

Extend `watch_plans.snapshot` (jsonb already exists) with a versioned `signalState` object:

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
    byRoute: Record<
      string /* carrier:dest */,
      { count: number; flightNumbers: string[] }
    >;
  };
  environment: {
    faaFingerprint: string; // hash of relevant program ids/types for origin(+hubs)
    weatherBand: "clear" | "watch" | "impact";
    weatherFingerprint: string;
  };
  lastRankAt: string | null;
  lastRankTrigger: string | null; // e.g. primary_cancelled | cancel_pressure | faa | weather | safety_refresh
}
```

Keep existing snapshot fields used by event detection (`judgment`, pillars, backup runway, access counts, etc.) for post-rank events — unchanged in role.

Optional later columns for indexing: `watch_plans.signal_hash text`, `last_rank_at`, `next_safety_refresh_at`. Prefer embedding in `snapshot` first to minimize schema churn.

---

## 8. Metrics / logging for API economics

Extend usage logging (reuse `api_usage_log` + structured logs).

Per Watch cycle log:

```ts
watch_cycle: {
  watchId, planId,
  outcome: "skip" | "status_only" | "rerank",
  trigger?,
  adbUnits, gf8Calls,
  fidsCacheHit, statusCacheHit,
  durationMs
}
```

Counters:

- ADB units by endpoint: `fids-departures`, `flight-status`, `flight-status:force`
- `source_cache` hit/miss by key prefix
- GF8 calls attributed to `watch_rerank` vs `plan_build`
- Rerank rate: `reranks / watch_cycles`
- Cohort size when airport-level trigger fires

**Success probe ledger:** 100 quiet watches × 2 cycles → GF8 ≈ 0, reranks ≈ 0, FIDS upstream ≈ unique airports × windows, status upstream ≪ 200.

---

## 9. Migration / database changes

### Minimum (recommended first)

- No required new tables — `watch_plans.snapshot` already jsonb; write `signalState` into it from `beginWatch` / `recheckWatch`.

### Optional follow-up

- `watch_plans.signal_hash text`
- `watch_plans.last_rank_at timestamptz`
- `watch_plans.next_safety_refresh_at timestamptz`

### Config (env, not DB)

| Env var | Default |
|---|---|
| `AERODATABOX_MONTHLY_UNIT_BUDGET` | 600 |
| `AERODATABOX_SOFT_STOP_REMAINING` | 50 |
| `AERODATABOX_MIN_INTERVAL_MS` | 1000 |
| `AIRCUE_WATCH_STATUS_TTL_SECONDS` | 1200 |
| `AIRCUE_WATCH_SAFETY_REFRESH_HOURS` | 6 |
| `AIRCUE_FIDS_TTL_SECONDS` | 3600 |

---

## 10. Staged implementation order (safest first)

| Stage | What | Risk | Why |
|---|---|---|---|
| **S0** | Env-driven ADB budget/rate limits; upgrade paid tier in ops | Very low | Stop false Basic assumptions |
| **S1** | Canonical FIDS key helper; schedule + cancel paths share keys; tests for window isolation | Low | Fixes correctness + cost before gating |
| **S2** | Preserve status on `RouteLeg` / provider resolution; reconciliation helper + unit tests | Low | Stops dropping board truth |
| **S3** | Watch status respects TTL (remove blind force); cron dedupe by flight | Low–med | Immediate unit savings |
| **S4** | `signalState` gather (FAA/weather/NWS + FIDS pressure + primary) + **no-change gate** before `rankStandbyOptions` | Med | Delivers cheap quiet watches |
| **S5** | Cohort rerank for airport/weather/FIDS triggers; primary-only for primary triggers; 6h safety refresh | Med | Correctness under disruption |
| **S6** | Operator verify only on primary change / missing verification / safety path | Low | Removes leftover spend |
| **S7** | Economics integration probe + regression tests in CI | Low | Locks the win |

**Do not ship S4 without S1** — gating on wrong FIDS windows will skip or fire incorrectly.

---

## 11. Test plan (acceptance)

### A. Unit / integration (no live ADB required)

- FIDS keys: same airport/date/window → same key; different windows → different keys; schedule and cancel helpers agree
- `force` false + fresh cache → 0 upstream status calls
- Gate: identical `signalState` → `recheckWatch` does not call `rankStandbyOptions` / GF8 / operator verify
- Gate: primary cancelled transition → rerank that plan only
- Gate: cancel pressure count +1 on shared origin → rerank cohort of active plans for that origin/date
- Gate: FAA/weather fingerprint change → cohort rerank
- Gate: safety refresh due → exactly one rank, then quiet again
- Reconciliation table cases (Unknown + hard cancel / CanceledUncertain / status wins)
- Existing cancel-once, incomplete-rank preserve, access snapshot immutability tests still pass

### B. Live / staging probe (after paid ADB tier)

Reuse the prior six probes:

1. FIDS cancellation still PASS
2. Shared cache: N plans, 1 upstream per airport/window
3. Primary status PASS with TTL reuse on second cycle
4. **no-change gating PASS** (was FAIL)
5. Cancel impact PASS; connection handling remains explicit
6. Economics: **100 quiet watches × 1h × 2 cycles**
   - GF8 calls ≈ 0
   - Full reranks ≈ 0
   - ADB FIDS upstream ≈ O(airports × windows), not O(watches)
   - ADB status upstream ≪ 200 (ideally closer to unique primaries × cycles with TTL hits)
7. Inject one real/synthetic disruption (FIDS cancel pressure or FAA) → only affected cohort reranks; others stay skip

### C. Correctness non-goals to watch

- Do not drop spillover/ops intelligence on nonstops
- Watch access snapshot remains immutable
- Provider failure ≠ travel failure; missing coverage ≠ positive event

---

## Locked product decisions

- **Safety refresh cadence:** 6 hours per Plan (env-overridable).
- **First cancel-pressure scope for gating:** same as today’s scoring — **nonstop route/carrier** pressure; connections keep FAA/weather gating in S4–S5, with a follow-up to attach FIDS pressure to connections without expanding GF8 heartbeat.
- **NWS:** wire into free environment fingerprint (currently unused).
- **Schema:** prefer embedding `signalState` in existing `snapshot` jsonb first; add columns only if ops need them.

## Success statement

After this rewrite, Standbye keeps the same brain (ops, cancel pressure, availability, eligibility events) but Watch becomes a **scheduler**: free/shared checks every 30 minutes, paid reassessment only when something meaningful moved — or on a narrow 6-hour safety refresh.
