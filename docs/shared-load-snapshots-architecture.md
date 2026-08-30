# Shared load snapshots — architecture & product plan

Status: **plan only** — product decisions below are locked. Do not implement the full feature from this document without a follow-up implementation brief.  
Baseline: current `main` after public-booking truthfulness work.

Product philosophy this plan must serve:

> Traveler gives Standbye what only they can access. Standbye automates everything else. Backend can be sophisticated; the experience should feel almost stupidly simple.

Network philosophy:

> Upload so Standbye can help **you**. Normalized flight-level snapshots may help other Standbye travelers as a side effect. No credits, no request queue, no “answer someone’s load.”

---

## Locked product decisions

| # | Decision |
|---|---|
| 1 | MVP visibility = **`eligible_reuse`**. Flight-level snapshots are reusable across travelers. Configurable policy/kill switch per airline remains. |
| 2 | **`observed_at`**: never ask on every upload. Priority: screenshot timestamp → file metadata → inferred upload time. Interrupt only when ambiguity may change the recommendation. |
| 3 | **United-only interpreter** for MVP. Parser/provider interfaces stay airline-neutral. |
| 4 | **Memory/temp processing**; discard raw image immediately. No permanent screenshot library. Storage+TTL only if later needed. |
| 5 | **Contribution ≠ consumption.** Contributor `home_airline` must match extracted flight airline to create a shared snapshot. Any eligible traveler may **consume** a valid snapshot for a flight on their plan — home airline does **not** gate consumption. |

---

## 1. What exists today

### Flight / option identity

Canonical identity already exists and should be reused:

```text
segment_key = CARRIERNUM:ORIG-DEST:YYYY-MM-DDTHH:MM
option_key  = segment_key [| segment_key …]
```

Implemented in [`src/lib/aircue/option-key.ts`](../src/lib/aircue/option-key.ts).  
`flight_label` is display-only.

`StandbyOption` / `OptionSegment` live in [`standby.ts`](../src/lib/aircue/standby.ts). Nonstops have one segment; connections have multiple. Persisted in `plan_options` with `option_key`, `segments` JSON, rank, judgment, pillars, evidence.

**Assumption check:** Canonical flight key is largely solved for **scheduled legs we already scored**. Gaps: codeshare/operating-carrier ambiguity (staff eligibility / operator verify exist), and screenshot extract may lack exact dep time — matching must tolerate fuzzy resolve against known plan segments / FIDS.

### Search → plan → watch

| Concept | Today |
|---|---|
| Search / build | `/plan` → `createPlan` → `buildPlan` → `rankStandbyOptions` → `plan_options` |
| Plan | `plans` + ranked `plan_options`; **Primary** = user commitment; **Preferred** = current #1 |
| Watch | `watch_plans` on a plan; cheap-watch gate (`skip` / `notify-only` / `rerank`); events in `plan_change_events` |
| Escape / Ways | Wider routing / gateway surfaces; same ranking vocabulary |

These three concepts already match Search / Plan / Watch. Do **not** invent a fourth funnel step.

### Data sources feeding a flight

| Source | Role |
|---|---|
| AeroDataBox (RapidAPI) | Schedule/FIDS, live status, operator verify |
| GF8 (RapidAPI) | Public booking party ladder (1–4) — commercial sellability, not seats |
| FAA NAS, METAR/TAF, NWS | Ops / weather |
| BTS hist tables | History context |
| `reported_loads` | User-entered open/listed — **per user_id only today** |
| `source_cache` | Provider response cache |

### Home airline / staff access today (contribution auth basis)

- [`standby_profiles.home_airline`](../supabase/migrations/20260828010506_b0b78475-255a-4f3b-89b8-4f511a5bbae1.sql) — required text, set at onboarding (default historically `'UA'`).
- Travel Access: home + declared ZED/interline partners ([`travel-access.ts`](../src/lib/aircue/travel-access.ts)). Never infers alliance eligibility.
- Plans snapshot access into `prefs.travelAccessSnapshot` including `homeAirline`.
- **No employment verification** exists (no `home_airline_verified_at` / method). Operator verify is about **flight operating carrier**, not whether the user works for an airline.

**MVP contribution auth (smallest reliable):** require authenticated user + non-empty `standby_profiles.home_airline`; only persist **shared** `LoadSnapshot` rows whose extracted airline equals that home airline. Client `airlineHint` is never authorization.  
**Later:** `home_airline_verified_at` / `home_airline_verification_method` without schema rewrite of snapshots.

### Reported loads today (critical)

[`ReportedLoad`](../src/lib/aircue/standby.ts): `segmentKey`, `openSeats`, `standbys`, `cabin`, `source`, `partyIncluded`, `checkedAt`.

[`loadsForSegments`](../src/lib/aircue/plan.server.ts) filters **`.eq("user_id", userId)`**. Form copy says loads stay private. Complete loads override the availability pillar for **that user’s** plan; partial loads stay neutral and preserve public booking for ranking.

**Gap vs vision:** segment-scoped load evidence + resort exist. Screenshots, shared snapshots, parser abstraction, and network reuse do not.

### Recommendations / cues

Four pillars → internal score → judgment + short headline. Public booking vs Reported load titles are source-aware after the truthfulness pass.

### Server / Lovable / AI today

- Domain: `src/lib/aircue/*.server.ts`; RPC via `*.functions.ts`
- Lovable: auth, Vite, error hooks, git sync — **no Lovable vision**
- **No** OCR, vision APIs, or Supabase Storage upload pipeline

### What must change (high level)

1. Separate screenshot (ephemeral) → parse job → flight-level `LoadSnapshot` → personal recommendation.
2. Ship **`eligible_reuse`** with a per-airline policy/kill switch.
3. `LoadScreenshotParser` + United interpreter first.
4. Contribution auth: `contributor.home_airline === snapshot.airline`.
5. Consumption: any traveler for whom the flight is a valid plan option may use an eligible snapshot (subject to freshness/visibility) — **not** gated by consumer home airline.
6. Extend load resolution beyond own `reported_loads` to eligible network snapshots.
7. Smart-refresh on watch/plan; memory/temp images discarded after extract.

**Do not rewrite:** ranking pillars, GF8, ADB, cheap-watch gate, Primary, `option_key` / `segment_key`, public-booking truthfulness.

---

## 2. Proposed product model (smallest clean model)

### Objects

```text
ScreenshotUpload     ephemeral bytes (never warehouse)
ParseJob             processing attempt + cost/metadata + image_sha256
LoadExtraction       structured rows pre-match (may include rejected airlines)
LoadSnapshot         canonical flight-level observation (reusable under policy)
TravelerPlan         existing plans + plan_options
TravelerContext      party size, access, primary, partyIncluded for *this* user
Recommendation       existing judgment/headline/rank (always personal)
AirlineVisibilityPolicy  configurable: private | eligible_reuse | aggregate_only | restricted
```

### Separation rules

| Layer | Cross-user? |
|---|---|
| Schedule / status / weather / FAA / history | Yes |
| LoadSnapshot (open/listed/cabin @ observed_at) | **Yes** under `eligible_reuse` (MVP) |
| partyIncluded, traveler names, pass priority, employee IDs, confirmation info, contributor identity | **Never** |
| Judgment / rank / Primary / Watch | **Never** — personal |

### Contribution vs consumption (critical)

```text
CONTRIBUTION AUTHORIZATION
  contributor.home_airline  MUST MATCH  extracted_flight.airline
  → only then may a reusable LoadSnapshot be created

SNAPSHOT REUSE (CONSUMPTION)
  valid active snapshot
  + sufficiently fresh
  + AirlineVisibilityPolicy permits reuse
  + flight is on / relevant to this traveler’s plan (access already applied by ranking)
  → may feed this traveler’s availability pillar

home_airline of the CONSUMER does NOT gate whether the observation exists or can be read.
```

Examples:

- UA employee uploads UA board → reusable UA snapshots → personalizes their plan.
- AA employee later plans ORD–LAX including UA123 (via their travel privileges) → may use the UA123 snapshot.
- UA employee’s screenshot that somehow shows AA rows → **do not** create shared AA snapshots (ignore/reject those rows for the network). Personal typed entry for non-home airlines stays out of shared network for MVP.

### MVP framing

United interpreter + United contributors creating reusable UA snapshots. Interfaces ready for `AmericanLoadInterpreter` / `DeltaLoadInterpreter` later. Manual typed form remains for correction / fallback (shared network only when contribution auth passes).

---

## 3. Database changes (prefer extend, not explode)

### Keep / extend

**`reported_loads`** — uploader’s personal record + correction source:

- Keep `user_id`, `segment_key`, `party_included` (personal — never shared)
- Add `snapshot_id uuid null` when a shared snapshot was also written
- Typed personal loads for non-home airlines: allowed for **own plan only**; do not mint `load_snapshots`

**`standby_profiles`** — later additive (not blocking MVP):

- `home_airline_verified_at timestamptz null`
- `home_airline_verification_method text null`

### Add (minimal)

**`load_snapshots`** (flight-level)

| Column | Purpose |
|---|---|
| `id` | PK |
| `segment_key` | Canonical match |
| `airline` | IATA of load board airline (must equal contributor home at write) |
| `flight_number`, `origin`, `dest`, `travel_date`, `sched_dep_utc` | Match / display aids |
| `cabin` | |
| `open_seats`, `standbys` | Normalized load fields only |
| `observed_at` | When employee system showed this |
| `timestamp_source` | `screenshot` \| `metadata` \| `inferred_upload` \| `user_confirmed` |
| `timestamp_confidence` | optional 0–1 |
| `captured_at` | Ingest time |
| `contributor_user_id` | Internal provenance only — never expose in UI |
| `source_kind` | `screenshot` \| `manual` \| `import` |
| `parser_provider`, `parser_model`, `parser_confidence` | |
| `match_confidence` | |
| `visibility` | denormalized effective policy at write (usually `eligible_reuse`) |
| `content_hash` | Structured dedupe |
| `parse_job_id` | FK optional |
| `superseded_by` | |
| `status` | `active` \| `superseded` \| `rejected` \| `unmatched` |

Indexes: `(segment_key, observed_at desc)` where active; `(airline, segment_key)`.

**`load_parse_jobs`**

| Column | Purpose |
|---|---|
| `id`, `user_id`, `created_at` | |
| `provider`, `model`, `status` | |
| `image_sha256` | Exact-image dedupe (no blob) |
| `contributor_home_airline` | Server-resolved at job start |
| `airline_hint` | Client hint only — not auth |
| `flight_count_extracted`, `flight_count_accepted`, `flight_count_rejected_airline` | |
| `cost_units`, `provider_request_id`, `raw_meta` jsonb | Strip PII; no image |
| `error` | |

**`airline_load_policies`** (or config table / env-backed registry)

| Column | Purpose |
|---|---|
| `airline` | PK (UA, AA, …) |
| `visibility` | `private` \| `eligible_reuse` \| `aggregate_only` \| `restricted` |
| `updated_at`, `note` | |

MVP seed: `UA → eligible_reuse`. Changing an airline to `restricted` kills network write/read without schema migration.

**Do not add in MVP:** screenshot blob table, credit ledger, request queue, permanent image warehouse.

---

## 4. Screenshot processing pipeline

```text
For each image (sequential / controlled concurrency — not unbounded parallel):
  Authenticate contributor
  Resolve contributor.home_airline from standby_profiles (server) — NOT client hint
  Hash image (sha256)
  If identical hash + recent successful job for this user: reuse extraction, skip paid vision
  LoadScreenshotParser.parseScreenshot({ bytes, airlineHint?: home_airline })
  Airline interpreter (United first) normalizes rows
  For each extracted flight:
    If airline cannot be determined confidently → do not create reusable snapshot
    If airline ≠ contributor.home_airline → reject for network (count rejected_airline)
    Else match → segment_key (plan board / FIDS)
    Confidence gate → active snapshot under AirlineVisibilityPolicy
  Derive observed_at (see § observed_at)
  Persist LoadSnapshot (+ optional personal reported_loads without partyIncluded from OCR)
  Discard raw image from memory/temp immediately
  rescoreAndResortPlanOptions for contributor’s plan
```

Multi-image uploads: process **one at a time** (or small fixed concurrency) to bound memory.

### `observed_at` priority (no default friction)

```text
1. Timestamp confidently read from screenshot  → timestamp_source = screenshot
2. Reliable image/file capture metadata         → metadata
3. Upload/capture time                         → inferred_upload
```

Only interrupt with “Was this load checked recently?” when evidence suggests the image may be **materially old** or timestamp ambiguity could change the recommendation — exception path → `user_confirmed`.

### Provider abstraction

```ts
interface LoadScreenshotParser {
  readonly providerId: string;
  parseScreenshot(input: {
    imageBytes: Uint8Array;
    mimeType: string;
    airlineHint?: string; // parsing aid only
  }): Promise<ParseResult>;
}

interface ParseResult {
  provider: string;
  model: string;
  confidence: number;
  flights: ExtractedFlightLoad[];
  observedAtGuess?: { at: string; source: "screenshot" | "metadata"; confidence: number };
  rawMeta?: unknown;
  usage?: { units?: number; costUsdEstimate?: number; requestId?: string };
}
```

Interpreters: `UnitedLoadInterpreter` (MVP), later American/Delta — after generic extraction.

RapidAPI vision = plugin under `providers/`. Product code does not import vendors elsewhere.

### Upload UX disclosure (simple)

One line, not a contribution workflow:

> Normalized flight information from your screenshot may help other Standbye travelers. Personal details are never shared.

User still uploads to get **their** plan analyzed.

---

## 5. Sharing / network logic

### Core loop

```text
User A (home=UA) uploads United screenshot
  → Standbye helps User A
  → UA flight snapshots enter eligible network
User B (home=AA) searches/plans including UA123
  → Standbye finds fresh UA123 snapshot
  → uses it in B’s plan if flight is on B’s ranked options
  → if missing/stale and B’s home is UA, B can upload/refresh United board
  → AA user cannot refresh UA board; they rely on network or public booking
```

No credits. No request queue. No deliberate community work.

### Snapshot eligibility (reuse)

User B may use snapshot S on segment K if **all** are true:

1. `S.status = active` and not superseded  
2. Effective `AirlineVisibilityPolicy` for `S.airline` permits reuse (`eligible_reuse` for MVP UA)  
3. Freshness above floor for hours-to-dep (§6)  
4. `S.match_confidence` ≥ threshold  
5. Segment K appears on B’s plan/board (ranking already applied B’s Travel Access)

**Removed from reuse conditions:** consumer `home_airline` / access intersecting snapshot airline as a gate on the observation itself. Access already decides whether UA123 is on B’s plan; once it is, the snapshot is just flight data.

### Contribution eligibility (write)

Before persisting shared `LoadSnapshot`:

1. Authenticate contributor  
2. Resolve verified/declared `home_airline` server-side  
3. Parse screenshot  
4. Identify airline per extracted flight  
5. **Require** extracted airline = contributor home airline  
6. Match `segment_key`  
7. Apply confidence / `observed_at` rules  
8. Persist under current airline policy visibility  

If airline uncertain → no reusable snapshot until resolved.

### Never enter the reusable network

Contributor identity, `partyIncluded`, traveler names, pass priority, employee identifiers, confirmation information, raw screenshot pixels, any other personal screenshot content.

### Cases

| Case | Behavior |
|---|---|
| 1 No snapshot | Public booking + ops + history + recovery; soft “Add your loads” if contributor can refresh that airline |
| 2 Very recent eligible | “Load updated 18m ago”; load pillar like complete load |
| 3 Aging | “Load may be stale”; down-weight; refresh CTA if user can contribute that airline |
| 4 Multiple | Newest `observed_at` wins; supersede older |
| 5 Contradictory | Higher confidence else newer; if both high disagree → conflict, fall back to public booking + refresh |
| 6 One screenshot, 15 flights | One job → up to 15 snapshots (home-airline only); attach those on this plan; others available network-wide |
| 7 Duplicate image | Hash hit → skip vision |
| 8 Unmatched schedule | `unmatched`; confirm; don’t invent keys |
| 9 No upload | Product still works |
| 10 Partial coverage | Per-segment override; known ≠ best |
| 11 Non-home rows in screenshot | Reject for network; do not poison AA snapshots from a UA uploader |
| 12 AA user needs fresh UA load | Cannot upload UA; use network or public booking; smart refresh won’t ask them for a UA screenshot |

---

## 6. Freshness rules (first practical algorithm)

```text
ageHours = (now - observed_at) / 3600
htd = hours to scheduled dep

base:
  age ≤ 0.5h → very_fresh
  age ≤ 2h   → fresh
  age ≤ 6h   → aging
  else       → stale

if htd ≤ 3 and ageHours > 1 → stale
if htd ≤ 6 and ageHours > 3 → aging (min)
if htd ≥ 48 and ageHours ≤ 12 → still usable as context
```

UI: Updated just now / 34m ago / 3h ago / Load may be stale / Refresh recommended.

Ops invalidation: cancel pressure / FAA / weather worsen / primary cancel after `observed_at` → treat as aging/stale for confidence even if clock-young.

Lower weight when `timestamp_source = inferred_upload` and age is ambiguous near departure.

---

## 7. Ranking logic under load availability

**Do not replace the pillar engine.** Fill availability from: personal complete load → else eligible network snapshot → else public booking.

| State | Availability pillar |
|---|---|
| **A Zero loads** | Public booking only |
| **B Partial** | Per-option snapshot or public booking; unknown ≠ automatic last |
| **C All fresh** | Load stronger; still weighted with ops/history/recovery |
| **D Stale after ops change** | Down-weight; confidence ↓; refresh if contributable |
| **E New screenshot** | Upsert snapshots → existing `rescoreAndResortPlanOptions` |

Personalization always: travelers, access, Primary, recovery. **Never** apply contributor’s `partyIncluded` to consumer.

---

## 8. Smart refresh logic (v1)

Emit **“Refresh your loads”** only when:

1. Watched plan or plan detail, AND  
2. Top-N used a load snapshot, AND  
3. Stale per §6 **or** cheap-watch rerank triggers **or** entered last ~3h with load age > 30m, AND  
4. **User’s `home_airline` matches the airline(s) needing refresh** (otherwise don’t ask an AA employee to upload a UA board)

Tone: conditions changed — not “help the community.”

---

## 9. UX changes (smallest flow)

```text
Search OD/date → results (load freshness when known)
  → Build my plan
  → Add your loads (screenshot) + one-line network disclosure
  → Found N flights; confirm only uncertain fields
  → plan updates
  → Watch this plan
Watch → rare Refresh your loads (if contributable)
```

Best / Backup / Keep an eye on + one sentence.

---

## 10. Vision provider architecture

```text
src/lib/aircue/load-screenshot/
  types.ts
  interpret/united.ts      // MVP only
  interpret/generic.ts
  match.ts
  contribute-auth.ts       // home_airline === flight.airline
  policy.ts                // AirlineVisibilityPolicy lookup
  providers/
    rapidapi-….ts
    mock.ts
  pipeline.server.ts       // sequential images, hash, delete bytes
  cost.server.ts
```

---

## 11. Cost model

| Costly | Mitigation |
|---|---|
| Vision per image | sha256 dedupe |
| Multi-image | Sequential processing; cap count/upload |
| GF8 / ADB | Unchanged; attach/resort local |
| Storage | None in MVP |

Log: images, units, success/fail, extracted vs accepted vs rejected_airline, snapshots created.

---

## 12. Privacy / security

- Raw screenshots: memory/temp → process → **discard**; persist hash + normalized fields only.  
- Shared rows: flight-level fields only.  
- RLS: parse jobs by user; snapshot reads via service role / controlled RPC respecting policy.  
- Never show contributor identity.  
- Policy table kill switch per airline (`restricted` / `private` / `aggregate_only` / `eligible_reuse`).  
- Correction without re-upload.

---

## 13. Edge cases (extra)

- Timezone / local vs UTC key mismatch  
- Codeshare marketing vs operator  
- Multi-cabin boards  
- Mixed outbound/return gallery  
- Non-home airline rows in screenshot → network reject  
- `observed_at` inferred near departure → optional recent-check interrupt  
- Poisoning: contribution auth + match confidence + later reputation; policy can restrict an airline instantly  
- Account deletion: anonymize `contributor_user_id`  
- Connection options: existing worst-leg load rules  
- Consumer cannot refresh contributor airline → rely on network/public booking  

---

## 14. MVP vs later

### MVP

1. Parser abstraction + RapidAPI provider + **UnitedLoadInterpreter**  
2. Memory/temp sequential upload → extract → contribution auth → `load_snapshots` (`eligible_reuse` for UA) + personal plan resort  
3. Network read path for eligible snapshots on any traveler’s plan  
4. Confirm-only-uncertain UI + simple disclosure  
5. Image hash dedupe; discard raw  
6. `observed_at` auto priority + rare interrupt  
7. Freshness UI + smart refresh (contributable airlines only)  
8. `airline_load_policies` seeded UA=`eligible_reuse`  
9. Declared `home_airline` as contribution auth  
10. Typed form remains  

### Later

- AA/DL interpreters  
- `home_airline_verified_at` / method  
- `aggregate_only` bands  
- Async Storage+TTL for large batches  
- Soft contributor benefits  
- **Out:** credits, request/answer marketplace, permanent screenshot archive  

---

## 15. Implementation sequence (safe order)

1. Schema: `load_parse_jobs`, `load_snapshots`, `airline_load_policies`, `reported_loads.snapshot_id`; drizzle + supabase.  
2. Policy + contribution-auth helpers + unit tests.  
3. Parser interface + mock + United interpreter fixtures.  
4. Match + `observed_at` derivation tests.  
5. Pipeline server fn (sequential, memory discard) → snapshots + personal resort.  
6. Network load resolution in `loadsForSegments` / scoring path (eligible snapshots).  
7. UI: Add your loads + disclosure + uncertain confirm.  
8. Freshness + smart refresh.  
9. Real RapidAPI provider + cost logging behind flag.  

Each step keeps GF8/ADB/cheap-watch intact.

---

## Where earlier assumptions were wrong or simpler

1. No new ranking engine — extend snapshot → `computeLoadEvidence` / resort.  
2. Flight identity exists — invest in OCR→`segment_key` matching.  
3. Search/Plan/Watch exist — UX is Add loads + freshness + refresh.  
4. **Reuse is not home-airline-matched on the consumer** — contribution is.  
5. **MVP ships `eligible_reuse`, not private-only.**  
6. **Don’t ask “when did you check?” by default.**  
7. **No screenshot warehouse in MVP.**  
8. No Lovable vision to remove.  
9. No StaffTraveler credits.

---

## Remaining non-blocking recommendations (not open product forks)

1. **MVP contribution auth = declared `standby_profiles.home_airline`.** Real employment verification is a later additive column pair; do not block screenshot MVP on it.  
2. **Manual typed loads** for the contributor’s own plan may still record personal `reported_loads` without minting shared snapshots when airline ≠ home (or always require home match for snapshot minting — recommend **always require home match for shared writes**).  
3. **Policy default for unknown airlines** = `restricted` until an interpreter ships.

No further blocking product decisions are required to write the implementation brief for slice 1 (schema + mock parser + United contribution path + eligible_reuse read path).
