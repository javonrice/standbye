# Flight Detail — Rork Build Spec (Route + Mockup)

**Use:** Paste into Rork (Plan Mode first, then build).  
**Scope this turn:** navigation route + UI mockup with mock data only. No real AeroDataBox / GF8 / weather APIs yet.

---

## [Purpose]

Build **Flight Detail** — the screen that shows everything Standbye knows about **one flight on the current Plan**.

The traveler opens it to understand *why* a flight is Favorable / Mixed / Riskier, see times, see ops/booking/backup summary, add a load, or make that flight current.

**Target user:** standby traveler on a phone, one-handed, in a hurry.  
**Mood:** calm, clear, travel-day focus — not a dashboard, not a booking site.  
**Primary goal:** one flight, one scroll of evidence, obvious next actions.  
**Feel:** high-production, polished, subtle enter transition.

---

## [Where it sits]

Bottom tabs stay: **Home · Plans · You**  
Flight Detail lives under **Home** (Plan work). Tab highlight = **Home**.

```text
HOME (Current Plan)
  │
  ├─ tap current flight ──────────────► FLIGHT DETAIL
  │
  └─ See other ways ──► WAYS
                          │
                          └─ tap any flight row ──► FLIGHT DETAIL
                                                      │
                                                      ├─ Add a load ──► Load screen
                                                      ├─ Make this current ──► confirm → Home
                                                      └─ Back → Home or Ways
```

---

## [Route]

```text
/(app)/home/flight/[flightId]
```

| Param | Meaning |
|-------|---------|
| `flightId` | Id of the flight on the active Plan |

**Also accept optional query/state:**

| Param | Meaning |
|-------|---------|
| `from=home` \| `from=ways` | Controls back target |

**Do not create:** `/options/[id]` as a product route name.

**Back behavior:**

- `from=home` → Home (Current Plan)  
- `from=ways` → Ways  
- default → Home  

---

## [Screen structure — top to bottom]

One scroll. No nested tabs on this screen. No cards-in-cards clutter.

```text
┌─────────────────────────────────────────┐
│  ←  ORD → LAX                           │  back + route eyebrow
├─────────────────────────────────────────┤
│  [UA]  UA1522                           │  carrier mark + flight label
│  Mon Aug 31                             │  travel date
│                                         │
│  ORD          12:40 PM                  │  origin + depart local
│  Departs                                │
│                                         │
│  LAX           3:05 PM                  │  dest + arrive local
│  Arrives                                │
│                                         │
│  Nonstop · all times local              │  meta line
│  Checked 28h ago                        │  mock “last checked”
├─────────────────────────────────────────┤
│  🙂  Favorable setup                    │  judgment
│  Strong booking with solid backup.      │  one why / headline
├─────────────────────────────────────────┤
│  Why this ranks here                    │  section title
│                                         │
│  Booking check          Strong          │  pillar row
│  Public seats still showing.            │  one-line detail
│                                         │
│  Operations             Strong          │  pillar row (weather/FAA)
│  No major disruption at ORD.            │
│                                         │
│  Backup runway          Strong          │  pillar row (recovery)
│  Several later ways still open.         │
├─────────────────────────────────────────┤
│  Reported load                          │
│  No load yet. If you can see the real   │
│  numbers, Standbye will re-rank the     │
│  plan around them.                      │
│                                         │
│  [ Add a load ]                         │  → /home/load?flightId=
├─────────────────────────────────────────┤
│  More context                           │  disclosure / links
│  · Route history                        │  expand or push stub screen
│  · Holiday near trip                    │  show if mock has holiday
│  · Weather / ops detail                 │  stub OK
├─────────────────────────────────────────┤
│  [ Make this current ]                  │  if NOT current
│  or                                     │
│  ✓ Your current plan                    │  if IS current (no button)
└─────────────────────────────────────────┘
```

### Layout rules

- **Hero:** brand/carrier + flight number dominant; times clear; no floating badges on the hero.  
- **Judgment:** one face + title + one short sentence.  
- **Pillars:** three rows max on the first viewport if possible (Booking / Operations / Backup). Detail is one line each.  
- **Load block:** always visible; empty state copy as above.  
- **More context:** secondary; collapsed or quiet list — not competing with judgment.  
- **CTA:** single primary at bottom — Make current **or** current checkmark.  
- **Cards:** only for interactive rows if needed; prefer plain section lists.  
- **No** stats strip, **no** map, **no** emoji decoration beyond the judgment face already used in product language.

---

## [Entry points to wire]

| From | Gesture | Navigate to |
|------|---------|-------------|
| Home Current Plan | Tap the big current-flight block | `/home/flight/[id]?from=home` |
| Ways list | Tap a row (Current / Still open / Passed) | `/home/flight/[id]?from=ways` |

On Home, keep existing CTAs (`See other ways`, `Add what I see`) — do **not** remove them. Tapping the flight itself opens detail.

---

## [Mock data model for this screen]

Use (or extend) PlanContext mock flight:

```ts
type FlightDetailMock = {
  id: string;
  planId: string;
  flightLabel: string;          // "UA1522"
  carrier: string;              // "UA"
  travelDate: string;           // "2026-08-31"
  origin: string;               // "ORD"
  dest: string;                 // "LAX"
  depLocal: string;             // "12:40 PM"
  arrLocal: string;             // "3:05 PM"
  kind: "nonstop" | "connection";
  isCurrent: boolean;
  judgment: "favorable" | "mixed" | "riskier";
  headline: string;
  lastCheckedLabel: string;     // "Checked 28h ago"
  pillars: Array<{
    key: "availability" | "operations" | "recovery";
    title: string;              // "Booking check" | "Operations" | "Backup runway"
    stateLabel: string;         // "Strong" | "Fair" | "Tight" | "Unknown"
    detail: string;             // one sentence
  }>;
  load: null | {
    openSeats: number | null;
    standbys: number | null;
    cabin: string;
  };
  holiday: null | {
    name: string;
    date: string;
    note: string;
  };
  historySummary: string;       // short stub for More context
};
```

**Seed one mock flight matching the product example:**

```text
ORD → LAX · UA1522 · Aug 31
Dep 12:40 PM · Arr 3:05 PM · Nonstop
Judgment: favorable
Pillars: Booking Strong, Operations Strong, Backup Strong
load: null
holiday: optional stub or null
isCurrent: true
```

Also seed a second flight on the same plan with `isCurrent: false` so Ways → detail can show **Make this current**.

---

## [Actions]

| Control | Behavior (mock) |
|---------|-----------------|
| Back | `router.back()` or explicit `from` target |
| Add a load | Navigate to Load screen with `flightId` preselected |
| Make this current | Confirm sheet → set `currentFlightId` in PlanContext → mark watching → go Home |
| Route history / More context | Expand inline **or** push a stub screen with mock paragraph — do not block F10 |

---

## [Copy bank]

```text
Favorable setup
Mixed setup
Take another look

Why this ranks here
Booking check
Operations
Backup runway

Reported load
No load yet. If you can see the real numbers, Standbye will re-rank the whole plan around them.
Add a load

More context
Route history

Make this current
Your current plan
```

Judgment face: 🙂 favorable · 😐 mixed · 😬 riskier (match existing product language; don’t add extra emoji chrome).

---

## [Design direction]

- Mobile-first, one column.  
- Expressive type (not Inter/Roboto default).  
- Soft atmospheric background (subtle sky/gradient), not flat gray, not purple-indigo AI theme, not cream+terracotta cliché.  
- Light mode default.  
- Subtle motion: screen enter + button press.  
- Pillar rows: hairline separators, not heavy cards.

---

## [Exclude]

- Real airline APIs / AeroDataBox / GF8 / live weather  
- Top-level Options tab or `/options` routes  
- Updates tab  
- Escape mode  
- Boarding probability / % clear  
- Editing profile  
- Multi-flight compare grid on this screen  
- Map view  

---

## [Build instruction for this turn]

1. Plan Mode: confirm route `/(app)/home/flight/[flightId]` under Home stack.  
2. Build Flight Detail mockup with the structure above and seeded UA1522 mock.  
3. Wire navigation: Home tap current → detail; Ways row tap → detail.  
4. Wire Add a load → existing Load stub/screen with flight preselected.  
5. Wire Make this current (confirm) for non-current flights.  
6. Keep Home composition unchanged except making the flight block tappable.  
7. At the end, list every file created or changed.

---

## [Acceptance checklist]

- [ ] Route exists under Home; Plans tab does not highlight on this screen  
- [ ] Back respects `from=home` / `from=ways`  
- [ ] UA1522 mock shows times, judgment, three pillars, empty load, CTA  
- [ ] Current flight shows “Your current plan”; other flight shows “Make this current”  
- [ ] Add a load navigates with that flight selected  
- [ ] Home still shows only one summary flight — detail is the deep dive  
- [ ] No `/options` product route; no new bottom tab  

---

## One-line summary for Rork

**Add Home-stack route `home/flight/[flightId]`: tap a flight from Home or Ways to open a single-flight evidence screen (times, judgment, booking/ops/backup, add load, make current) with mock data — no live APIs this turn.**
