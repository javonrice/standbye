# Public booking truthfulness + source-label consistency

Status: **plan only** — not implemented. Target: current `main` (`fa55511` at time of writing).

This is a semantics, presentation, source-attribution, and documentation pass. It is broader than [`ranking.server.ts`](../src/lib/aircue/ranking.server.ts). It does **not** change GF8 scoring, party probes, load math, Primary, Watch gating, or provider behavior.

---

## Product truth

Standbye's GF8 1–4 probe answers only:

> How large a party does the public booking flow still show as bookable on this exact flight right now?

It does **not** establish physical seats open, standby seats, remaining capacity, fullness, oversold status, or clearance likelihood.

A flight can remain publicly sellable even when operational load is full or oversold.

| Evidence | Meaning |
|---|---|
| **Public booking** | Commercial sellability. Internal pillar key stays `availability`. |
| **Reported load** | User-supplied load. Stronger where complete. |

Do not weaken or strengthen GF8 scoring in this pass. Known-oversold-flight validation is not done yet.

---

## Hard non-goals

Do not change:

- GF8 provider behavior ([`google-flights8.server.ts`](../src/lib/aircue/google-flights8.server.ts))
- `PARTY_LEVELS = [1, 2, 3, 4]`
- Ranking weights / `stateScore` / `scoreOf`
- `PillarState` scoring values (`good` / `fair` / `poor` / `unknown` in `availabilityFor`)
- Load-aware scoring, `computeLoadEvidence()`, partial-load neutrality
- Primary semantics
- `option_key` / `segment_key` identity
- Watch economics / notification thresholds
- SerpAPI behavior, ADB behavior
- Historical [`.lovable/plan`](../.lovable/plan) archives

`availabilityFor` may change **label** and **detail** only. States and evidence shape stay.

---

## P0 — Public booking labels

Today, [`availabilityFor`](../src/lib/aircue/ranking.server.ts) (~277–335) emits Strong / Narrowing / Tight / Not selling / Limited / Not available. 2 and 3 share one branch.

Keep internal pillar key `availability`. Change user-facing labels/details:

| `largestShowing` | label | detail |
|---|---|---|
| `>= 4` | Booking open for 4+ | Public booking is still accepting a party of 4. |
| `=== 3` | Booking open for 3 | Public booking currently shows for parties up to 3 travelers. |
| `=== 2` | Booking open for 2 | Public booking currently shows for parties up to 2 travelers. |
| `=== 1` | Solo booking showing | Public booking currently shows for 1 traveler, but not a larger party. |
| `=== 0` | No public booking found | We couldn't find even a 1-traveler booking for this flight right now. |
| provider / board failure | Booking check unavailable | We couldn't complete the public booking check. That does not mean the flight is full. |
| checked but `largestShowing` null | Booking signal limited | Public booking is showing, but Standbye couldn't determine the current party-size limit. |

Never describe raw GF8 as: seats available, seats open, single seat, likely not oversold, full, wide open, standby availability, exact availability, seats remaining, or Strong / Narrowing / Tight / Not selling as the **public observation** label.

Internal `good` / `fair` / `poor` / `unknown` stay unchanged.

Also align adjacent ranking user copy that still says “public availability” (no scoring change):

- `reasonTitle`: `{label} public booking`
- poor headline: **No public booking found on this one.** (replaces “Public availability has dried up on this one.”)
- mixed/favorable headlines that clearly mean the GF8 pillar: say “public booking” rather than generic “availability”

---

## P0 — Source-aware pillar titles

Current [`pillarTitle.availability`](../src/lib/aircue/standby.ts) is `"Availability"`. Too generic: the same internal pillar may be driven/displayed by public booking **or** reported load.

Do **not** globally rename `availability` to “Public booking”.

Create a reusable display helper (presentation only — do not contaminate the domain model):

```ts
pillarDisplayTitle(key, option?: { load?: unknown } | null): string
```

- if `key !== "availability"`: existing `pillarTitle`
- if `key === "availability"` AND `option.load` exists: **Reported load**
- if `key === "availability"` AND no `option.load`: **Public booking**

A partial reported load still displays as **Reported load · Partial**, even though public booking remains the scoring pillar internally.

Keep `pillarTitle.availability = "Availability"` as a generic fallback for callers with no option context.

Update all option-aware surfaces:

- [`StandbyOptionRow.tsx`](../src/components/aircue/StandbyOptionRow.tsx) (Plan Detail, Escape nonstops, etc.)
- Option Detail “Why Standbye says this” in [`options.$optionId.index.tsx`](../src/routes/_authenticated/options.$optionId.index.tsx)
- Plan Detail option rows (via `StandbyOptionRow`)
- [`PillarGrid.tsx`](../src/components/aircue/PillarGrid.tsx) / `PillarList`: add optional `hasReportedLoad` or `titleFor` — they have no option context today and are unused by live routes

Compare is **not** a global rename of the row; see Compare section.

---

## P0 — Option Detail

File: [`src/routes/_authenticated/options.$optionId.index.tsx`](../src/routes/_authenticated/options.$optionId.index.tsx)

- Audit all “availability” language.
- Keep the separate Reported load card.
- In “Why Standbye says this”, availability row title:
  - **Reported load** if `option.load` exists
  - **Public booking** otherwise
- Do not let a load-derived availability pillar appear under “Public booking”.
- Light-align the load-card `partyIncluded === "no"` line from “not listed yet” to “not included in that standby count” (matches the live load form question).
- Footer:

> Standbye combines public booking, operating conditions, history, recovery, and any reported load you add. Public booking is not airline load data, and Standbye never predicts whether you'll clear.

Also update the Plan list footer in [`plans.$planId.index.tsx`](../src/routes/_authenticated/plans.$planId.index.tsx) (“Public availability is a demand signal…”) to public **booking** wording, same meaning.

---

## P0 — Public booking detail page

File: [`src/routes/_authenticated/options.$optionId.availability.tsx`](../src/routes/_authenticated/options.$optionId.availability.tsx)

- Rename user-facing page from “Public availability” to **Public booking**.
- Metadata/OG: **Public booking — Standbye**.
- Teach exactly one concept: this is how large a party the public booking flow still shows as bookable.
- Replace local `readSignal` with the shared formatter so server and UI cannot drift.
- 4+ note:

> Standbye currently checks up to 4 travelers. So 4+ means the check reached our current ceiling — not that four or more physical seats are open.

Do **not** say: airline stops confirming exact space beyond 4; could be wide open; flight is filling up; cabin has not tightened; flight is close to full.

- PartyScale explanation: each dot is a party size Standbye checked; filled means that party size still appeared bookable.
- What this means: commercial booking signal; changes over time can show public booking tightening or loosening.
- What this doesn't mean: not airline load, not standby-list position, not seats you could clear into. A complete reported load is stronger and can replace this signal in the Plan.
- StandbyeTake:
  - `>= 4`: still open to the largest party Standbye currently checks. Useful evidence — not proof of open standby seats.
  - `2–3`: accepting smaller parties but not the larger ones checked. Tighter commercial signal.
  - `<= 1` / `0`: very constrained or no longer showing. Still not actual standby load.
- Handle null/failure honestly (unchecked module already says “not as full” — keep that honesty, align wording to “public booking check”).

Route path `/options/$optionId/availability` stays (URL churn out of scope).

---

## P0 — PartyScale accessibility

File: [`src/components/aircue/DetailScreen.tsx`](../src/components/aircue/DetailScreen.tsx)

Current aria: “still selling” / “not selling”.

Use:

- `${adults} traveler(s): booking shown`
- `${adults} traveler(s): no booking shown`

Do not imply the entire flight is or is not selling from one probe state.

---

## P0 — Compare page

File: [`src/routes/_authenticated/plans.$planId.compare.tsx`](../src/routes/_authenticated/plans.$planId.compare.tsx)

Do **not** call the entire row “Public booking” — compared options may have different evidence sources.

- Neutral row title: **Load / booking**
- Each cell identifies its source, compact/mobile scannable:
  - `Reported load · Tight`
  - `Public booking · Booking open for 4+`
  - `Reported load · Partial`
- No separate public-booking scoring system.

---

## P0 — How Standbye works

File: [`src/routes/_authenticated/how-it-works.tsx`](../src/routes/_authenticated/how-it-works.tsx)

Remove unsupported claims equivalent to:

- “Seats still look open”
- “This is the kind of setup most people clear on”
- “fewer open seats” when referring to public booking
- “the flight is close to full” unless a reported load actually establishes it
- “seats disappearing” when the observed change is public sellability
- “Standbye checks how many seats the airline will still sell”
- “If almost nothing is left for sale, there is almost nothing left for standby”
- “Seat counts come from what is publicly for sale”

Rewrite judgment meanings around **combined evidence**:

| Judgment | Meaning |
|---|---|
| Favorable | The overall setup looks stronger right now: public booking, operations, history, recovery, and any reported load are working more in your favor. |
| Mixed | The setup has tradeoffs. One or more signals are tighter or uncertain, but you may still have useful recovery options. |
| Riskier | Several signals are working against the plan, or your recovery runway is thin. Worth another look before you commit. |
| Changed | Something meaningful moved after Standbye checked again — for example public booking tightened, operations worsened, a cancellation changed the day, or another option became stronger. |

Under “What we look at”:

- **Public booking** — Standbye checks how large a party the public booking flow still shows as bookable. This is a commercial pressure signal, not the standby load.
- **Reported loads** — If you add a load from an employee system or another source you trust, Standbye uses that stronger flight-specific evidence in the Plan.
- Operations, history, recovery stay conceptually the same.

Limitations:

> Public booking can remain open even when the operational load is tight or oversold. Standbye does not treat bookability as an exact seat count.

Never make population-level clearance claims such as “most people clear”.

---

## P0 — Watch / Updates copy

File: [`src/lib/aircue/plan-watch-events.server.ts`](../src/lib/aircue/plan-watch-events.server.ts)

Keep `largestShowing` and event mechanics unchanged.

| Current | New |
|---|---|
| Public availability tightened | **Public booking tightened** |
| Public availability has closed | **No public booking found** |

Suggested detail:

- `nextLargest > 0`: `Public booking now shows for parties up to ${nextLargest}, down from ${prevLargest}. This is a commercial booking signal, not the standby load.`
- `nextLargest === 0`: `Standbye no longer found a public booking for the tested party size. That does not prove the flight is full or oversold.`

Updates UI ([`updates.$watchId.tsx`](../src/routes/_authenticated/updates.$watchId.tsx)) renders stored headlines — no extra hardcoded availability strings found. Do not change notification thresholds.

---

## P0 — Onboarding booking lesson

Files:

- [`src/components/aircue/onboarding/TeachingScreens.tsx`](../src/components/aircue/onboarding/TeachingScreens.tsx)
- [`src/lib/aircue/onboarding-examples.ts`](../src/lib/aircue/onboarding-examples.ts)
- [`src/routes/onboarding.tsx`](../src/routes/onboarding.tsx)
- [`src/lib/aircue/onboarding.ts`](../src/lib/aircue/onboarding.ts)

The booking-teaching section is already directionally truthful. Preserve structure. Align language to production UI.

**What's the booking check?**

Keep: Standbye checks whether the exact flight is publicly offered for different party sizes.

Hero: **Booking open for 4+**

Then: that does not mean four seats are open. Standbye currently checks up to four travelers, so 4+ only means public booking reached our current test ceiling.

**Comparing options:** keep comparing public-booking signals and movement. Prefer “Booking open for 1 / 4+ / 2” rather than “N travelers showing”. Keep: “We use that movement as evidence — not as a count of empty seats.”

---

## P0 — Onboarding reported load semantics

PR #6 removed `alreadyListed` as the scoring truth. Current scoring uses `partyIncluded`:

| `partyIncluded` | Meaning |
|---|---|
| yes | `effectiveListed = reportedStandbys` |
| no | `effectiveListed = reportedStandbys + partySize` |
| unsure / null | `effectiveListed = null`, `cushion = null`, partial evidence |

Replace “whether you're already listed…” with:

> Standbye looks at your party, whether your travelers are already included in the reported standby count, how fresh the load is, and the rest of the day.

Fix `partyReadings`. Do not use “not listed yet” as a proxy for `partyIncluded`.

Teaching example must match `computeLoadEvidence()` exactly. Suggested:

Reported load: **4 open · 3 listed**

| Who | Copy | `partyIncluded` | Result |
|---|---|---|---|
| Solo traveler | 1 traveler · already included in the 3 listed | yes | listed 3, cushion 1 → **fair** |
| Family of 4 | 4 travelers · not included in the 3 listed | no | listed 7, cushion −3 → **poor** |

---

## P1 — Onboarding stale copy

Current onboarding metadata still says “a few quick questions and four short examples”. `painEcho` includes “the whole thing in four small stories”. These are stale.

Rewrite without hard-coding a teaching-screen count.

Suggested metadata:

> A few quick questions, then Standbye shows how it builds and watches a standby plan.

`checking_loads` painEcho (current “This is where that stops” is too absolute):

> You told us the constant checking is the worst part. Standbye helps you know when another look is worth it.

`all_of_it`:

> You told us it's all of it. So here's how Standbye puts the whole day together.

Do not add steps or redesign onboarding.

---

## P1 — Searching overlay

File: [`src/components/aircue/SearchingOverlay.tsx`](../src/components/aircue/SearchingOverlay.tsx)

- “Checking booking inventory” is acceptable.
- Change “Checking availability and operations” → **Checking public booking and operations**.
- Audit any other user-facing animation/status copy that describes the GF8 probe as seat availability.

---

## P1 — Shared copy helper

Avoid duplicating public-booking formatting in ranking, availability detail, compare, and onboarding.

Create a small **client-safe pure helper**, conceptually:

```ts
publicBookingPresentation(evidence or largestShowing) → { label, detail }
```

Suggested path: [`src/lib/aircue/public-booking-presentation.ts`](../src/lib/aircue/public-booking-presentation.ts)

- Ranking `availabilityFor` consumes it for label/detail only.
- Availability detail page replaces local `readSignal`.
- Compare cells can use the label half.
- Onboarding may use labels where production helpers are suitable.

Do not move server I/O into client code. Do not change the persisted schema.

---

## P1 — Documentation

Update [`docs/load-aware-ranking.md`](./load-aware-ranking.md). It is stale after PR #6.

Remove: `already_listed` DB column, `alreadyListed`, `userAlreadyListed`, old party math.

Document actual semantics:

```text
partyIncluded yes  → effectiveListed = reportedStandbys
partyIncluded no   → effectiveListed = reportedStandbys + partySize
partyIncluded unsure/null → effectiveListed = null, cushion = null
                           partial reported evidence
                           public booking preserved for ranking
                           confidence lowered
```

Where the GF8 pillar is described as generic “availability”, prefer “public booking” for clarity.

Do **not** rewrite historical `.lovable/plan` archives.

---

## Tests

Add or update regression tests covering:

1. `largestShowing = 4` → Booking open for 4+; no “4 seats”
2. `largestShowing = 3` → Booking open for 3
3. `largestShowing = 2` → Booking open for 2
4. `largestShowing = 1` → Solo booking showing; no “single seat”
5. `largestShowing = 0` → No public booking found; no “full”, “oversold”, or exact seat inference
6. Provider failure → Booking check unavailable; explicitly not full inference
7. Option without load → source title Public booking
8. Option with complete load → source title Reported load; existing load scoring unchanged
9. Option with partial load → Reported load · Partial for display; public booking scoring remains neutral/preserved
10. Compare with mixed evidence sources → source shown correctly per option
11. Watch `largestShowing` decrease → Public booking terminology; no load/full claim
12. Onboarding party example → matches `partyIncluded` semantics exactly via `computeLoadEvidence()`

Then: `bun test`, `bunx tsc --noEmit`, `bun run build`.

---

## Intentionally leave (after user-facing audit)

Do not blindly replace every match. True reported-load contexts may say “open”. Internal field names can remain `availability`. Historical docs/plans stay historical.

| Surface | Why leave |
|---|---|
| Internal key `availability`, `AvailabilityEvidence`, route `/options/$optionId/availability` | Domain/API; URL churn out of scope |
| Load labels Strong / Tight / Oversubscribed / Partial and “N open seats reported” | Real reported-load seats |
| Load form “Yes, we’re already listed” ([`options.$optionId.load.tsx`](../src/routes/_authenticated/options.$optionId.load.tsx)) | Answers “already included in that standby count”; not GF8 |
| [`__root.tsx`](../src/routes/__root.tsx) SEO (“odds”, “seat availability”) | Marketing chrome, not in the listed surfaces. Include only if product asks. |
| Historical `.lovable/plan` | Archives |
| Test fixture labels `"Strong"` in load-resort tests | Load pillars, not public booking |

Repo-wide risky-term audit after implementation: Availability, seat(s) available, open seats, single seat, full, oversold, wide open, filling, selling freely, most people clear, already listed. Report every user-facing occurrence intentionally left and why.

---

## Implementation notes

1. Land the shared helper first so ranking, detail, compare, and tests cannot drift.
2. Split today’s `largest >= 2` branch so 2 and 3 get distinct labels.
3. Confirmation at PR time: ranking weights and provider logic were untouched (diff should be copy, helpers, tests, and this docs family only).
4. Browser-verify changed UI surfaces (option row, option detail, public booking page, compare, how-it-works, onboarding teaching screens) after implementation — not required to land this plan file.

---

## Return checklist (when implementing)

- Files changed
- User-facing copy surfaces changed
- Tests changed/added
- Ambiguous spots that would require a scoring/product decision
- Confirmation that ranking weights and provider logic were untouched
- User-facing risky terms intentionally left, with reasons
