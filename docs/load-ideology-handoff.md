# Load Ideology — Who Enters, Who Sees, How Sharing Works

**Purpose:** Standalone product handoff for the new Rork / Cursor repo.  
**Paste this file** if you already uploaded the domain handoff / wireframe and need loads rules without the full architecture dump.

**Related (old repo, deeper):** `docs/shared-load-snapshots-architecture.md`, `docs/load-aware-ranking.md`  
**Domain cost rules also in:** `docs/domain-handoff-for-rork.md` §9

---

## 1. Philosophy (locked)

```text
Traveler gives Standbye what only they can access.
Standbye automates everything else.
Backend can be sophisticated; the experience should feel almost stupidly simple.
```

```text
Upload so Standbye can help YOU.
Normalized flight-level snapshots may help other Standbye travelers as a side effect.
No credits. No request queue. No “answer someone’s load.”
```

Loads are **evidence on a Plan**, not a social product and not a StaffTraveler-style marketplace.

---

## 2. Two layers (don’t conflate)

| Layer | Stored as | Who it’s for | Shared? |
|-------|-----------|--------------|---------|
| **Personal reported load** | `reported_loads` (user-owned) | **This traveler’s** plan scoring | No — private to them |
| **Network snapshot** | `load_snapshots` (flight-level) | Anyone with that flight on a plan (if policy allows) | Yes — under rules below |

**Merge when scoring a Plan:**

```text
personal load for a segment  WINS
network snapshot             FILLS GAPS only
```

Identity is always **`segment_key`**, never `flight_label`:

```text
UA881:ORD-HND:2026-10-15T17:00
```

---

## 3. How loads get entered

Two equal first-class paths. Screenshot must **not** be the only path.

### A. Manual entry (“Enter manually”)

| Rule | Locked |
|------|--------|
| Entry point | **Plan-level** “Add what I see” — not buried on a single option only |
| Shape | **Multi-row** form in one submit |
| Fields | Flight (or pick from plan), open seats, standbys/listed, cabin; partial rows OK (open-only or listed-only) |
| Matching | Resolve to `segment_key` on this plan / board; don’t invent off-plan worldwide flights in MVP |
| Prefill | Checkbox list of plan flights so typing is optional |
| Correction | Can fix one row after a screenshot without re-upload |
| `partyIncluded` | yes / no / unsure — **personal only; never shared to network** |

### B. Screenshot upload

| Rule | Locked |
|------|--------|
| Vision MVP | Gemini Flash structured JSON (not Lovable-coupled core) |
| Raw image | Memory / temp only — **discard after parse**; no permanent screenshot library |
| Interpreter MVP | **United-first**; interfaces airline-neutral for AA/DL later |
| Multi-flight | One board shot → many extracted rows → match to plan segments |
| `observed_at` | Prefer screenshot timestamp → file metadata → upload time; **don’t ask every time**; interrupt only if ambiguity would change the recommendation |

### UI sketch

```text
Add what I see
  [ Upload screenshot ]   [ Enter manually ]

Enter manually
  [+] UA2110  open ___  listed ___  cabin ___
  [+] UA1234  open ___  listed ___  cabin ___
  [ Save to plan ]
```

### Explicitly NOT in MVP

- Answering someone else’s load request  
- Credits / karma / “help the network” quests  
- Free-for-all flight wiki for arbitrary worldwide flights  
- Requiring screenshot to use Standbye  

---

## 4. Contribution vs consumption (critical)

**These are different gates. Never use the same rule for both.**

### Contribution (who may **publish** a shared snapshot)

```text
ONLY IF:
  user is authenticated
  AND standby_profiles.home_airline is set
  AND home_airline === flight.airline on the extracted/typed row
```

Examples:

| Contributor home | Flight | Personal on their plan? | Shared network snapshot? |
|------------------|--------|-------------------------|---------------------------|
| UA | UA2110 | Yes | **Yes** (if policy allows) |
| UA | AA100 | Yes (if on their plan / access) | **No** — airline mismatch |
| AA | UA2110 | Maybe personal only | **No** |

- Client `airlineHint` is **never** authorization — resolve `home_airline` **server-side**.  
- Same home-airline rule for **screenshot and manual** shared writes.  
- MVP auth = **declared** `home_airline` (no employment verification yet). Later: `home_airline_verified_at` additive.  
- No employment verify product in MVP.

### Consumption (who may **see / use** a shared snapshot)

```text
IF snapshot is valid + fresh + airline policy allows reuse
AND the flight is on this traveler’s plan (as an option/segment)
→ they may consume it

Consumer home_airline does NOT gate read.
```

Examples:

| Consumer home | Snapshot airline | Flight on their plan? | May use snapshot? |
|---------------|------------------|----------------------|-------------------|
| UA | UA | Yes | **Yes** |
| AA (ZED/other access to UA flight on plan) | UA | Yes | **Yes** |
| Anyone | UA | No (flight not on plan) | **No** — not a browse-all wiki |

**Access already decides** whether UA123 appears on their plan. Once it does, the snapshot is just flight evidence.

---

## 5. Visibility policy (network)

MVP visibility mode: **`eligible_reuse`**

| Policy value | Meaning |
|--------------|---------|
| `eligible_reuse` | Flight-level snapshots reusable across travelers (MVP for UA) |
| `private` | No network reuse |
| `aggregate_only` | Later — stats only, no raw seats |
| `restricted` | Kill switch — block network write/read for that airline |

- Configurable **per airline** (seed: `UA → eligible_reuse`).  
- Flipping an airline to `restricted` kills sharing **without** a schema rewrite.  
- Personal `reported_loads` always remain private regardless of policy.

---

## 6. What happens after entry (cost ideology)

```text
1. Save personal reported_loads (always, for this user)
2. Maybe mint load_snapshots IF contribution auth + policy pass
3. Locally rescore + resort THIS plan’s options
4. DO NOT call rankStandbyOptions / GF8 / ADB
5. DO NOT auto-change current flight when rank #1 moves
```

Zero paid flight-provider calls on load attach is a **hard invariant**.

Disclosure: when a row will enter the reusable network (home-airline match), show a simple one-liner — not a contribution workflow.

---

## 7. Who sees what in the UI

| Surface | Sees |
|---------|------|
| Traveler on their Plan | Judgments reflecting **personal ∪ network** merge (personal wins) |
| “Add what I see” | Their entry form; optional note if row will help the network |
| Other travelers | Never see *who* uploaded; only normalized seats/listed/cabin @ observed_at if policy allows |
| Activity | “Load updated” on **their** plan — not a social feed of network uploads |
| Admin / policy | Per-airline kill switch — not traveler-facing |

Never show: contributor identity, credits, “3 people need this board,” request queues.

---

## 8. Party / privacy fields

| Field | Personal | Shared snapshot |
|-------|----------|-----------------|
| open seats | Yes | Yes (normalized) |
| standbys / listed | Yes | Yes (normalized) |
| cabin | Yes | Yes |
| `partyIncluded` | Yes | **Never** — strip before network |
| raw screenshot | Ephemeral | **Never stored** long-term |
| contributor user id | Internal job metadata | Not shown in product UI |

---

## 9. Freshness & trust (short)

- Prefer newer `observed_at` when merging network candidates.  
- Stale snapshots don’t override fresh personal entry.  
- Partial rows (open-only or listed-only) stay valid; don’t invent the missing number.  
- Low match confidence → confirm with traveler; don’t silently attach wrong flight.  
- Poisoning mitigation: contribution auth + match confidence + per-airline kill switch.

---

## 10. Prompt fragment for the new Cursor chat

```text
Implement loads using docs/load-ideology-handoff.md:

- Personal reported_loads always for the signed-in traveler’s plan
- Shared load_snapshots only when contributor.home_airline === flight.airline
- Consumption: any traveler with that flight on their plan may use eligible_reuse snapshots;
  consumer home_airline does NOT gate read
- Manual multi-row + screenshot are both first-class
- partyIncluded never goes to the network
- After save: local rescore only — no GF8/ADB; do not auto-switch current flight
- No credits, request queues, or “help someone else’s load” UX
- MVP: United interpreter for screenshots; interfaces airline-neutral
- Visibility MVP: eligible_reuse with per-airline kill switch

Do not invent a social load marketplace.
List every file you change.
```

---

## 11. One-line summary

**You enter loads to help your Plan (manual or screenshot). Personal always stays yours. Shared snapshots only when your home airline matches the flight; anyone with that flight on their plan can reuse them. No credits, no ask-queue, no auto-rerank providers on save, no auto-changing current flight.**
