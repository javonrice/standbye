# Shared load snapshots — architecture & product plan

Status: **plan only** — do not implement from this document without a follow-up implementation brief.  
Baseline: current `main` after public-booking truthfulness work.

Product philosophy this plan must serve:

> Traveler gives Standbye what only they can access. Standbye automates everything else. Backend can be sophisticated; the experience should feel almost stupidly simple.

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

**Assumption check:** Your “canonical flight key” need is largely solved for **scheduled legs we already scored**. Gaps: codeshare/operating-carrier ambiguity (we have staff eligibility / operator verify), and screenshot extract may lack exact dep time — matching must tolerate fuzzy resolve against known plan segments / FIDS.

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

### Reported loads today (critical)

[`ReportedLoad`](../src/lib/aircue/standby.ts): `segmentKey`, `openSeats`, `standbys`, `cabin`, `source`, `partyIncluded`, `checkedAt`.

[`loadsForSegments`](../src/lib/aircue/plan.server.ts) filters **`.eq("user_id", userId)`**. Form copy says loads stay private. Complete loads override the availability pillar for **that user’s** plan; partial loads stay neutral and preserve public booking for ranking ([`load-evidence.ts`](../src/lib/aircue/load-evidence.ts), [`option-scoring.ts`](../src/lib/aircue/option-scoring.ts)).

**This is the biggest product gap vs the new vision:** we already have segment-scoped load evidence and load-aware resort with **zero GF8 on attach**. We do **not** have screenshots, shared snapshots, parser abstraction, or network reuse.

### Recommendations / cues

Four pillars → internal score → judgment (`favorable` / `mixed` / `riskier` / `changed`) + short headline. UI: Plan detail, option cue, compare, ways, escape. Public booking vs Reported load titles are source-aware after the truthfulness pass.

### Server layout

- Domain: `src/lib/aircue/*.server.ts`
- Thin RPC: `*.functions.ts` + Supabase auth middleware
- Watch cron: `/api/public/run-watches`
- Dual migrations: `supabase/migrations/` + `drizzle/migrations/` (keep both in sync for new columns)

### Lovable

Auth (`@lovable.dev/cloud-auth-js`), Vite config, error reporting hooks, git sync caution. **No Lovable vision/AI in the codebase.** Do not couple screenshot parsing to Lovable.

### AI / OCR / storage today

**None.** No OpenAI/Anthropic/Gemini, no OCR, no Supabase Storage buckets, no upload pipeline.

### What must change (high level)

1. Separate **screenshot artifact** from **flight-level load snapshot** from **traveler plan recommendation**.
2. Make snapshots optionally reusable under a **visibility policy** (default conservative).
3. Add `LoadScreenshotParser` provider abstraction + airline interpreters.
4. Extend attach/resort path to consume shared eligible snapshots, not only own `reported_loads`.
5. Add smart-refresh prompts driven by watch signals + snapshot age (cheap-watch already has the signal spine).
6. Ephemeral image handling — process then delete by default.

**Do not rewrite:** ranking pillars, GF8, ADB, cheap-watch gate, Primary semantics, `option_key` / `segment_key`, public-booking truthfulness.

---

## 2. Proposed product model (smallest clean model)

### Objects

```text
ScreenshotUpload     user-provided image (ephemeral)
ParseJob             one processing attempt + cost/metadata
LoadExtraction       structured rows from a parse (pre-match)
LoadSnapshot         canonical flight-level observation (post-match)
FlightObservation    optional umbrella later — MVP = LoadSnapshot only
TravelerPlan         existing plans + plan_options
TravelerContext      party size, access, primary, partyIncluded for *this* user
Recommendation       existing judgment/headline/rank (always personal)
```

### Separation rules

| Layer | Reusable across users? |
|---|---|
| Schedule / status / weather / FAA / history | Yes (already) |
| LoadSnapshot (open/listed/cabin @ time) | **Maybe** — gated by visibility policy |
| partyIncluded / “am I on the list” | **Never** — traveler-specific |
| Judgment / rank / Primary / Watch | **Never** — personal |

User motivation: “Upload so Standbye can help **you**.” Network coverage is a side effect, not a marketplace.

### MVP framing

United-first **interpreter**, multi-airline **architecture**. Manual typed load form remains as fallback / correction.

---

## 3. Database changes (prefer extend, not explode)

### Keep / extend

**`reported_loads`** — remains the **uploader’s personal record** and correction source. Add optional link:

- `snapshot_id uuid null` → shared snapshot that was created from this report
- Keep `user_id`, `segment_key`, `party_included` (personal)

### Add (minimal)

**`load_snapshots`** (flight-level, reusable subject to policy)

| Column | Purpose |
|---|---|
| `id` | PK |
| `segment_key` | Canonical match target |
| `airline` | Marketing/home context (e.g. UA) |
| `flight_number`, `origin`, `dest`, `travel_date`, `sched_dep_utc` | Redundant match aids / display |
| `cabin` | economy / … |
| `open_seats`, `standbys` | Core load fields (nullable if partial) |
| `observed_at` | When the employee system showed this (from screenshot or user) |
| `captured_at` | When we ingested |
| `contributor_user_id` | Provenance (not shown publicly by default) |
| `source_kind` | `screenshot` \| `manual` \| `import` |
| `parser_provider`, `parser_model`, `parser_confidence` | Provenance |
| `match_confidence` | How sure we are of segment_key |
| `visibility` | enum — see §12 |
| `content_hash` | Dedupe structured payload |
| `parse_job_id` | FK optional |
| `superseded_by` | Newer snapshot for same segment |
| `status` | `active` \| `superseded` \| `rejected` \| `unmatched` |

Indexes: `(segment_key, observed_at desc)` where `status = active`; `(visibility, segment_key)`.

**`load_parse_jobs`**

| Column | Purpose |
|---|---|
| `id`, `user_id`, `created_at` | |
| `provider`, `model`, `status` | |
| `image_sha256` | Exact-image dedupe |
| `airline_hint` | User or inferred |
| `flight_count_extracted` | |
| `cost_units`, `provider_request_id`, `raw_meta` jsonb | Cost/ops (raw image **not** stored long-term) |
| `error` | |

**`load_screenshot_blobs`** (optional, short TTL)

- Prefer: upload to private Storage → process → **delete within minutes**.
- If Storage is heavy for MVP: accept upload in server fn, hold in memory/temp, never persist — only store `image_sha256` on the job.

**Do not add in MVP:** credit ledger, social request queue, permanent screenshot warehouse, per-metric user-facing score tables.

### Visibility enum (configurable policy)

```text
private          — only contributor’s plans
eligible_reuse   — other authenticated standby users may use values in ranking
aggregate_only   — future: band/freshness only (no exact open/listed)
restricted       — admin kill switch
```

Default for MVP: **`private`**, with an explicit opt-in later to `eligible_reuse` — **or** home-airline-matched reuse if product chooses (see §5). Architecture supports either without schema rewrite.

---

## 4. Screenshot processing pipeline

```text
Upload (1..N images)
  → hash image (sha256)
  → if identical hash + successful job recently: reuse extraction, skip paid vision
  → LoadScreenshotParser.parseScreenshot({ bytes, airlineHint?, locale? })
  → airline interpreter normalizes rows
  → match each row → segment_key against:
        (a) segments on user’s current plan/search board
        (b) optional FIDS/schedule expand for that OD/date
  → confidence gate:
        high → create/update LoadSnapshot (+ personal reported_loads)
        medium → show confirm UI (only uncertain fields)
        low → reject row / ask typed correction
  → delete raw image (default)
  → rescoreAndResortPlanOptions for contributor’s plan (existing path)
  → if visibility allows, snapshots become readable for other plans on same segment_key
```

### Provider abstraction

```ts
// conceptual — src/lib/aircue/load-screenshot/types.ts
interface LoadScreenshotParser {
  readonly providerId: string;
  parseScreenshot(input: {
    imageBytes: Uint8Array;
    mimeType: string;
    airlineHint?: string;
  }): Promise<ParseResult>;
}

interface ParseResult {
  provider: string;
  model: string;
  confidence: number;          // overall
  flights: ExtractedFlightLoad[];
  rawMeta?: unknown;           // retain carefully; strip PII
  usage?: { units?: number; costUsdEstimate?: number; requestId?: string };
}

interface ExtractedFlightLoad {
  airline?: string;
  flightNumber?: string;
  origin?: string;
  dest?: string;
  date?: string;
  depLocal?: string;
  cabin?: string;
  openSeats?: number | null;
  standbys?: number | null;
  fieldConfidence: Record<string, number>;
}
```

Airline adapters: `interpretUnited(parse)`, `interpretAmerican(parse)`, … — **after** generic extraction, not inside the HTTP client.

RapidAPI vision vendor is a **plugin** behind `LoadScreenshotParser`. Product code never imports a vendor SDK directly outside `providers/`.

---

## 5. Sharing / network logic (when User B benefits)

### Eligibility (MVP rule — inspectable)

User B may use snapshot S on segment K if **all** are true:

1. `S.status = active` and not superseded by a newer active snapshot on K  
2. `S.visibility` ∈ allowed set for B (start: `eligible_reuse`, or private-only if not launched)  
3. Freshness score above floor for B’s hours-to-dep (see §6)  
4. `S.match_confidence` ≥ threshold  
5. Optional policy: B’s `home_airline` / access intersects snapshot airline  

**Never** copy A’s `partyIncluded` into B’s plan. B’s party math always uses B’s travelers + B’s list status (or unsure → partial).

### Cases

| Case | Behavior |
|---|---|
| 1 No snapshot | Rank with public booking + ops + history + recovery (State A). Soft CTA: “Add your loads” |
| 2 Very recent eligible | Show “Load updated 18m ago”; use in availability pillar like today’s complete load |
| 3 Aging | Show “Load may be stale”; down-weight or treat as partial; may prompt refresh |
| 4 Multiple | Newest `observed_at` among eligible wins; keep prior as superseded history |
| 5 Contradictory near-simultaneous | Prefer higher parser+match confidence; else newer; if both high and disagree → mark conflict, **do not** auto-pick extremes — fall back to public booking for ranking + “loads disagree — refresh” |
| 6 One screenshot, 15 flights | One ParseJob → up to 15 snapshots; only those matching plan/board attach to this plan; others stored if visibility allows for later OD searches |
| 7 Duplicate image | Hash hit → no second vision call; idempotent snapshot upsert |
| 8 Unmatched to schedule | Keep as `unmatched` extraction; ask user to confirm flight; don’t invent option_key |
| 9 No upload | Standbye still useful (today’s product) |
| 10 Partial coverage | Known loads override per segment; unknown segments keep public booking — **known ≠ best** |

---

## 6. Freshness rules (first practical algorithm)

Reuse today’s multipliers as a starting point, then **scale by hours to departure**:

```text
ageHours = (now - observed_at) / 3600
htd = hours to scheduled dep

base:
  age ≤ 0.5h → very_fresh
  age ≤ 2h   → fresh
  age ≤ 6h   → aging
  else       → stale

# tighten near departure
if htd ≤ 3 and ageHours > 1 → stale
if htd ≤ 6 and ageHours > 3 → aging (min)
if htd ≥ 48 and ageHours ≤ 12 → still usable as context (fresh or aging, not auto-stale)
```

UI strings (no fake live precision):

- Updated just now / 34m ago / 3h ago  
- Load may be stale  
- Refresh recommended  

Ops invalidation (from existing watch signals): if after `observed_at` we see primary cancel, cancel-pressure jump, FAA fingerprint change, or weather band worsen → treat snapshot as **aging/stale for ranking confidence** even if clock age is low (§8).

---

## 7. Ranking logic under load availability

**Do not replace the pillar engine.** Extend how the availability pillar is filled.

| State | Availability pillar | Effect |
|---|---|---|
| **A Zero loads** | Public booking only | Current behavior |
| **B Partial** | Per-option: complete eligible snapshot → load pillar; else public booking | Rank mixes; unknown must not sort last solely for being unknown |
| **C All fresh** | Load pillar stronger (existing cushion states) | Still weighted with ops/history/recovery — load is not sole input |
| **D Stale after ops change** | Down-weight load (partial/unknown) + keep public booking underneath | Confidence ↓; refresh CTA |
| **E New screenshot** | Upsert snapshots → `rescoreAndResortPlanOptions` (already zero network) | Explain via existing “best option changed” + short reason |

**Known ≠ best:** a last flight with great load can still lose to earlier flight + excellent recovery (already true in load-aware ranking docs).

Personalization always applies: travelers, access, Primary, recovery runway.

---

## 8. Smart refresh logic (v1 rules)

Build on cheap-watch outcomes — **do not** nag every cycle.

Emit user-facing **“Refresh your loads”** only when:

1. Plan is watched or user is on plan detail, AND  
2. At least one option in top-N used a load snapshot, AND  
3. One of:
   - snapshot now stale per §6, or  
   - watch gate would `rerank` due to cancel pressure / primary delay≥15 / FAA change / weather worsen / primary cancel, or  
   - hours-to-dep crossed a threshold (e.g. entered last 3h) while load age > 30m  

Copy tone: conditions changed / load may no longer support this decision — not “upload for the community.”

---

## 9. UX changes (smallest flow)

```text
Search OD/date  →  ranked results (load freshness line when known)
                 →  [Build my plan]  (mostly today’s createPlan)
Missing useful loads on considered set → [Add your loads] → upload screenshot(s)
                 →  “Found 12 flights” + only uncertain confirms
                 →  plan updates in place
                 →  [Watch this plan]
Watch           →  rare “Refresh your loads” when §8 fires
```

Surfaces stay simple: Best / Backup / Keep an eye on + one sentence. No 17-metric dump.

Typed load form remains for correction and non-vision users.

---

## 10. Vision provider architecture

```text
src/lib/aircue/load-screenshot/
  types.ts                 // LoadScreenshotParser, ParseResult
  interpret/united.ts      // airline-specific field mapping
  interpret/generic.ts
  match.ts                 // extraction → segment_key
  providers/
    rapidapi-vision-a.ts   // swappable
    mock.ts                // tests
  pipeline.server.ts       // orchestration, hash dedupe, delete blob
  cost.server.ts           // write parse_jobs usage
```

Env: `LOAD_SCREENSHOT_PROVIDER=rapidapi_x`, provider API keys — mirror GF8/ADB pattern (`*_ENABLED`, monthly caps via `api_usage_log` or dedicated table).

---

## 11. Cost model

| Costly | Mitigation |
|---|---|
| Vision parse per image | sha256 dedupe; don’t re-parse identical bytes |
| Vision on multi-page uploads | Batch in one request if provider allows; else cap images/upload |
| GF8 / ADB | Unchanged — attach/resort stays local; watch stays gated |
| Storage | Default delete; no CDN gallery |

Track per job: images, provider units, success/fail, flights extracted, snapshots created, cost estimate → eventually cost per active user / per snapshot.

---

## 12. Privacy / security

- Raw screenshots: process and **delete**; retain hash + structured data only.  
- RLS: parse jobs & personal reports by `user_id`; snapshots readable only per `visibility` policy (service role for matching engine).  
- Don’t show contributor identity in UI for MVP.  
- Visibility configurable — **do not** hardcode “all employees see exact loads.”  
- Airline confidentiality: prefer private default until explicitly opened.  
- Correction flow must not require re-uploading the screenshot.

---

## 13. Edge cases (extra)

- Screenshot timezone vs airport local vs UTC key mismatch  
- Codeshare: UA marketed, OO operated — match marketing first, verify operator later  
- Cabin mix on one screen (Y vs J) — one snapshot per cabin or store multi-cabin JSON  
- Return date mixed into outbound gallery  
- User uploads competitor airline loads while home is UA — policy filter  
- Clock skew: `observed_at` missing → use `captured_at` and lower confidence  
- Malicious/wrong screenshot poisoning shared pool — reputation later; MVP private-only avoids blast radius  
- GDPR/deletion: user delete account → anonymize contributor_id, keep or drop snapshots per policy  
- Plan with connection: snapshot on one leg only — existing worst-leg rules apply  

---

## 14. MVP vs later

### MVP

1. Parser abstraction + one RapidAPI vision provider + United interpreter  
2. Ephemeral upload → extract → match to plan segments → personal `reported_loads` + optional `load_snapshots`  
3. Confirm-only-uncertain UI  
4. Image hash dedupe + delete raw  
5. Freshness display + stale down-weight  
6. Smart refresh v1 hooked to watch signals  
7. Visibility column present; **ship private-only** (or single-airline eligible_reuse behind flag)  
8. Keep typed form  

### Later

- Cross-user `eligible_reuse` broadly  
- American/Delta interpreters  
- Aggregate-only bands  
- Contributor reputation / soft benefits  
- Multi-cabin rich schema  
- Request/answer marketplace (**explicitly out** — not StaffTraveler)  
- Permanent screenshot archive (**out**)  

---

## 15. Implementation sequence (safe order)

1. **Schema** — `load_parse_jobs`, `load_snapshots`, soft FK from `reported_loads`; visibility enum; migrations in both supabase + drizzle tracks.  
2. **Parser interface + mock provider + unit tests** (no RapidAPI required).  
3. **Match + interpret United** against fixtures (synthetic JSON, not real screenshots in repo).  
4. **Pipeline server fn** — upload → mock/real parse → personal reported_loads → existing `attachLoad` / multi-segment resort.  
5. **UI** — Add your loads (multi image) + uncertain confirm; wire to plan.  
6. **Freshness UI** on option rows + cue.  
7. **Smart refresh** copy on watch/plan using existing signal gate.  
8. **Real RapidAPI provider** behind flag + cost logging.  
9. **Eligibility read path** for shared snapshots (feature flag; default off).  
10. **Policy / privacy review** before enabling reuse.

Each step ships without breaking GF8/ADB ranking or cheap-watch economics.

---

## Where your assumptions were wrong or simpler

1. **You don’t need a new ranking engine.** Load-aware pillars + resort already exist; extend snapshot → same `computeLoadEvidence` path.  
2. **Flight identity largely exists** (`segment_key`). Invest in **matching** from OCR, not a second key system.  
3. **Search / Plan / Watch already exist** — UX is mostly “Add your loads” + freshness + refresh CTA, not a new product shell.  
4. **Loads are private today** — sharing is a deliberate policy unlock, not a small tweak; schema should allow it without flipping default on day one.  
5. **No Lovable vision to rip out** — greenfield parser abstraction is clean.  
6. **StaffTraveler-style credits are unnecessary** for MVP; usage-driven coverage is enough.  
7. **Public booking remains essential** for State A/B — screenshot network will never be complete.

---

## Open product decisions (need a call before build)

1. MVP visibility: **private-only** vs home-airline `eligible_reuse`?  
2. Is `observed_at` required from user when OCR can’t see a timestamp?  
3. First airline: confirm **United-only** interpreter for MVP?  
4. Storage: Supabase Storage with TTL delete vs memory-only processing?

Recommend defaults: **private-only**, **United-first**, **memory/temp delete**, ask user “when did you check?” if timestamp missing.
