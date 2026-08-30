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
| 6 | **Vision provider (MVP):** **Google Gemini Flash** (direct Gemini API / AI Studio) as primary `LoadScreenshotParser` — vision + JSON Schema structured output. Not Lovable-coupled. RapidAPI JSON OCR remains a documented alternate. |
| 7 | **Manual entry stays first-class** and must become **more open** than today’s option-scoped single-flight form (plan-level multi-row entry; not screenshot-only). |

---

## Vision provider selection

Architecture still uses `LoadScreenshotParser`. This section picks the **first** implementation.

### What we need from the provider

| Requirement | Why |
|---|---|
| Image in (bytes / base64) | Ephemeral memory upload — no public URL required |
| Structured multi-flight out | One UA board screenshot → many rows |
| Custom schema / JSON Schema | Map to `ExtractedFlightLoad[]` without brittle regex |
| Measurable cost | Log units/$ on `load_parse_jobs`; model against subscription revenue |
| Travels with the codebase | Not Lovable-proprietary; swappable behind the interface |

### Candidates compared

| API | Fit | Cost shape (as of research) | Risk |
|---|---|---|---|
| **Gemini 2.5 Flash (direct)** ([Google AI](https://ai.google.dev/gemini-api/docs/pricing)) | **Best overall.** Native vision + JSON Schema structured outputs; bytes in; first-party | Paid ~**$0.30 / $2.50 per 1M** in/out tokens. Typical phone screenshot ≈ few hundred–low thousand image tokens → often **≪ $0.01 / image** | Separate bill from RapidAPI; need Google AI key + our usage logging |
| **Gemini Flash-Lite (direct)** | Same shape, cheaper | Lower $/token than Flash | May miss dense table cells — A/B on UA boards |
| **JSON OCR** (RapidAPI zeroteam) | Schema→JSON, base64; stays on RapidAPI | Free 30/mo; Pro **$29 / 500** (~**$0.06–0.07**/image) | ~10–100× more expensive than Flash for same job; middleman |
| **OCR Wizard** (RapidAPI) | Cheap raw text only | Pro **$12.99 / 5k** | We own brittle structuring |
| ChatGPT aggregators on RapidAPI | Vision chat | Cheap sticker price | Schema/routing opacity |
| Invoice/receipt APIs | Wrong domain | — | Skip |

### Recommendation (revised)

**Primary MVP provider: Gemini Flash outright (Google Gemini API).**

Prefer **`gemini-2.5-flash`** (or current Flash equivalent) with:

- `response_mime_type = application/json`
- `response_json_schema` = our `ExtractedFlightLoad[]` schema

Reasons:

1. **Cost:** orders of magnitude below RapidAPI JSON OCR for screenshot→structured flights — sustainable if upload volume grows.  
2. **Quality fit:** multimodal Flash is built for reading UI/tables; structured outputs reduce parse failures.  
3. **Product ownership:** first-party Google key travels with Standbye if we leave Lovable; not a marketplace wrapper.  
4. **Still swappable:** lives only as `providers/gemini-flash.ts` behind `LoadScreenshotParser`.  
5. **Metering:** we already planned `load_parse_jobs` cost/usage metadata — RapidAPI was nice-to-have billing co-location with GF8/ADB, not a hard requirement. GF8/ADB stay on RapidAPI; vision can be Google.

**Optional RapidAPI path:** keep JSON OCR as `providers/json-ocr.rapidapi.ts` if we ever want all keys on one marketplace — not the MVP default.

**Do not** use Lovable vision. **Do not** use invoice/receipt APIs.

### Provider validation gate

1. Private United load screenshots (not in git).  
2. Run Gemini Flash with our schema; score flights recovered, open/listed accuracy, latency, $/success.  
3. Optional A/B vs Flash-Lite and vs one JSON OCR sample.  
4. Lock model id in env (`LOAD_SCREENSHOT_PROVIDER=gemini_flash`, `GEMINI_MODEL=…`).

---

## Manual entry — keep and open it up

Screenshot upload must not be the only path. Manual entry already exists but is **too closed** for the new product.

### What exists today

Route: [`/options/$optionId/load`](../src/routes/_authenticated/options.$optionId.load.tsx) → `addReportedLoad` → `attachLoad`.

| Constraint | Today |
|---|---|
| Scope | **Single plan option only** — must already be on the plan |
| Flights per submit | **One** segment |
| Multi-flight paste | **None** |
| Open / listed | Optional (nullable) — keep |
| `partyIncluded` | yes / no / unsure — keep (personal only; never shared) |
| Cabin / source | UI dropdowns locked; server accepts free strings |
| Discovery | Mostly option cue / availability — easy to miss from plan |

Server contribution to the **shared network** from manual entry should follow the same rule as screenshots: mint `LoadSnapshot` only when `home_airline` matches the flight airline.

### How “more open” should work (MVP)

Still helping **this traveler’s plan** — not a free-for-all flight wiki UI.

1. **Plan-level “Add loads”** entry (alongside screenshot upload), not only buried on one option.  
2. **Multi-row manual form:** add N flights in one submit (flight number, origin, dest, date/time or pick from plan board, open, listed, cabin).  
3. **Match to plan/board segments** the same way screenshots do (`segment_key`); unmatched rows → confirm / don’t invent.  
4. **Partial rows OK** (open-only or listed-only) — same partial neutrality as today.  
5. **Prefill from plan options** (checkbox list of UA123 / UA456…) so typing is optional when the flight is already ranked.  
6. **Optional freer flight identity** when needed: type `UA123` + times if the user has a load for a flight on today’s board that wasn’t the option they tapped — still must resolve to a canonical segment on the plan/search board for MVP (don’t accept arbitrary off-plan worldwide flights yet).  
7. Simple disclosure when a row will enter the reusable network (home-airline match).  
8. Keep typed path as **correction** after screenshot (“fix this one”) without re-upload.

### Explicitly not “more open” in MVP

- StaffTraveler-style answer someone else’s request  
- Manual entry for airlines ≠ contributor `home_airline` into the **shared** network (own-plan-only personal `reported_loads` may still be allowed if we want; recommend **same home-airline rule for shared writes**)  
- Permanent screenshot-derived PII fields in the form  

### UX sketch

```text
Add your loads
  [ Upload screenshot ]   [ Enter manually ]

Enter manually
  Rows: Flight | Open | Listed | Cabin | [on plan ▾]
  + Add another flight
  Party included? (once per submit, personal only)
  → Save → same snapshot + resort pipeline as screenshot (minus vision)
```

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
  → Add your loads
        ├─ Upload screenshot(s)  → Gemini Flash parse → confirm uncertain
        └─ Enter manually (multi-row, plan/board matched)
  → one-line network disclosure when shared snapshots will be created
  → plan updates
  → Watch this plan
Watch → rare Refresh your loads (if contributable)
```

Best / Backup / Keep an eye on + one sentence.

Manual entry is always available — including as correction after a partial screenshot parse.

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
    gemini-flash.ts        // MVP primary (Google Gemini API)
    json-ocr.rapidapi.ts   // optional RapidAPI alternate
    ocr-wizard.rapidapi.ts // optional cheap text fallback
    mock.ts
  pipeline.server.ts       // sequential images, hash, discard bytes
  cost.server.ts
```

Env: `LOAD_SCREENSHOT_PROVIDER=gemini_flash` (default), `GEMINI_API_KEY`, `GEMINI_MODEL` (e.g. `gemini-2.5-flash`).
---

## 11. Cost model

| Costly | Mitigation |
|---|---|
| Gemini Flash per image (typically ≪ $0.01) | sha256 dedupe; downscale huge images; sequential uploads |
| Multi-image | Cap count/upload; process one-at-a-time |
| GF8 / ADB (RapidAPI) | Unchanged; attach/resort local |
| Storage | None in MVP |
| Manual multi-row | **Free** (no vision) — prefer shipping this early |
| JSON OCR alternate | Only if we opt in — ~$0.06+/image |

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

1. Parser abstraction + **Gemini Flash (direct)** provider + **UnitedLoadInterpreter**  
2. Memory/temp sequential upload → extract → contribution auth → `load_snapshots` (`eligible_reuse` for UA) + personal plan resort  
3. Network read path for eligible snapshots on any traveler’s plan  
4. Confirm-only-uncertain UI + simple disclosure  
5. Image hash dedupe; discard raw  
6. `observed_at` auto priority + rare interrupt  
7. Freshness UI + smart refresh (contributable airlines only)  
8. `airline_load_policies` seeded UA=`eligible_reuse`  
9. Declared `home_airline` as contribution auth  
10. **Open manual entry** (plan-level multi-row) sharing the same snapshot/resort path — not option-only single form  
11. Keep typed correction after screenshot  

### Later

- AA/DL interpreters  
- Flash-Lite cost A/B; RapidAPI JSON OCR only if needed as alternate billing path  
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
5. **Open manual multi-row entry** → shared snapshot path (no vision) — ships value before paying for OCR.  
6. Pipeline server fn (sequential, memory discard) + **Gemini Flash provider** behind flag → snapshots + personal resort.  
7. Provider validation on private UA screenshots; then enable in prod.  
8. Network load resolution in scoring path (eligible snapshots).  
9. UI: Add your loads (screenshot **and** manual) + disclosure + uncertain confirm.  
10. Freshness + smart refresh.  
11. Cost logging / caps.  

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
10. **Best vision fit is Gemini Flash direct** (cheap + structured JSON), not RapidAPI JSON OCR as default — RapidAPI stays optional.  
11. **Manual entry must widen** (plan-level multi-row); today’s option-only form is too closed.
12. GF8/ADB can stay on RapidAPI while vision uses Google — metering lives in `load_parse_jobs`.

---

## Remaining non-blocking recommendations (not open product forks)

1. **MVP contribution auth = declared `standby_profiles.home_airline`.** Real employment verification is a later additive column pair.  
2. **Shared writes always require home-airline match** (screenshot and manual).  
3. **Policy default for unknown airlines** = `restricted` until an interpreter ships.  
4. **Validate Gemini Flash on real UA boards** before locking model; optional Flash-Lite A/B.  

No further blocking product decisions are required to write the implementation brief for slice 1 (schema + open manual multi-row + mock parser), then slice 2 (Gemini Flash + United screenshots).
