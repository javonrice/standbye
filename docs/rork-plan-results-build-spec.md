# Rork build — Plan results (graded flights / decision intelligence)

**Paste this into the Rork Cursor chat.** UI + mock data only. **No backend, no APIs, no Supabase.**

This screen was **missing** from earlier prompts. Insert it **between New Plan and Home / Current Plan**.

---

## Why this screen exists

After **Build my plan**, the traveler must **not** jump straight to Home with only one current flight.

They first see **decision intelligence**: **every ranked flight for this Plan**, each with a **grade** (and a short why). That is the “Standbye thought about this trip” moment.

Only **after** they absorb the list (and usually confirm or accept a starting flight) do they land on **Home / Current Plan** — the day-of HQ with one current flight and watching.

```text
New Plan  →  [Build my plan]  →  PLAN RESULTS (graded list)  →  Home / Current Plan
                                      ↑
                               THIS WAS MISSING
```

**Ways** (later, under Home) is the *ongoing* list while working the day.  
**Plan results** is the *first reveal* after build — same underlying flights, **grades front and center**, choose-how-to-start energy.

---

## Job

| | |
|--|--|
| **Job id** | **F2.5** (between F2 Create and F3 Work) |
| **Function** | Show decision intelligence |
| **Screen** | **Plan results** |
| **One job** | See every graded flight for this Plan; pick how to start (or accept #1) |
| **Route** | `home/plan-results` (stack under Home; after build, replace New Plan with this) |
| **Tabs** | Still **Home · Plans · You** — this lives in the Home stack |

**Not a fourth tab. Not Settings. Not Flight detail.**

---

## Entry / exit

| From | Action | To |
|------|--------|-----|
| New Plan | Tap **Build my plan** (valid From / To / When) | **Plan results** (this screen) |
| Plan results | Tap a flight row | Optional: Flight detail **or** confirm sheet |
| Plan results | **Start with this flight** / **Make this current** | Home / Current Plan |
| Plan results | **Continue with top pick** (primary if none selected) | Home / Current Plan with #1 as current |
| Plan results | Soft back | New Plan (edit) — rare |

**Do not** skip this screen on first build.  
**Do not** auto-land on Current Plan with no list reveal.

Later in the day, **See other ways** opens **Ways** (sectioned Current / Still open / Passed) — not a full rebuild of Plan results. Same flights, different framing.

---

## What “graded” means (UI, mock)

Each row is a **flight** (or connection as one row), ranked best → worst.

Show for every row:

| Element | Traveler language | Mock field |
|---------|-------------------|------------|
| Rank | `#1`, `#2`, … or implicit by order | `rank` |
| **Grade** | Letter or band — e.g. **A / B / C / D** or **Strong / OK / Weak** | `grade` |
| Flight | `UA 1234` · time · path (Nonstop / via DEN) | `flightNumber`, `departLocal`, `pathLabel` |
| One why | Short human line | `why` |
| Status chip | optional: Still open / Tight / etc. | `statusLabel` |

**Grade is the hero of the row** — not buried. Decision intelligence = **ordered list + visible grade + one why**.

Do **not** show raw score numbers like `87.3` unless you also show grade; prefer grade + why.

---

## Screen composition (one job)

**First viewport:** brand-scale Plan context + one line that this is the ranked set + start of the graded list.  
**Not** a dashboard of stats. **Not** Current Plan (no single-flight hero yet).

```text
┌─────────────────────────────────────┐
│  Standbye                           │
│  SFO → JFK                          │
│  Sat Mar 14 · 1 traveler            │
│                                     │
│  Ranked for your access             │  ← one supporting sentence
│                                     │
│  ─── Best first ─────────────────   │
│                                     │
│  ┌─ #1 ── A ─────────────────────┐  │
│  │  UA 456 · 8:15a · Nonstop     │  │
│  │  Strong seat + timing fit     │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ #2 ── B ─────────────────────┐  │
│  │  UA 789 · 11:40a · via DEN    │  │
│  │  Solid backup if morning fills│  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ #3 ── B ─────────────────────┐  │
│  │  …                            │  │
│  └───────────────────────────────┘  │
│                                     │
│  … more rows …                      │
│                                     │
│  [ Continue with top pick ]         │  ← sticky footer OK
│  or after selecting a row:          │
│  [ Start with this flight ]         │
└─────────────────────────────────────┘
```

### Rules

- **All** graded flights for the Plan appear here (mock: 5–8 rows). Scroll is fine.
- Order = rank 1…n (best first).
- **No** “current” section yet unless you already auto-highlighted #1 as suggested start — still show the full list.
- Path chips optional above list (All / Nonstop / via …) — filter only; don’t replace grades.
- Primary CTA: accept **#1** or **selected** row → Home.
- Secondary: tap row → sheet **Start with this flight** / **See details** (details → Flight detail if you have F10).
- One composition: plan header + graded list + one CTA. No Activity, no Load, no watching line yet.

### Empty / thin (mock edge)

If only 1–2 flights: still show this screen (grades matter even for a short list). Don’t skip to Home.

---

## Copy (locked tone)

| Use | Avoid |
|-----|--------|
| Ranked for your access | Decision intelligence (UI label) |
| Best first | Options engine / scored inventory |
| Grade A / Strong | Probability 0.87 |
| Start with this flight | Activate primary option |
| Continue with top pick | Commit ranked[0] |

Internal docs may say “decision intelligence”; **traveler UI must not**.

---

## Mock data (extend Plan)

After “build”, mock Plan should include:

```ts
PlanResultsFlight {
  id: string
  rank: number          // 1 = best
  grade: "A" | "B" | "C" | "D"   // or Strong | OK | Weak | Long shot
  flightNumber: string
  departLocal: string
  arriveLocal?: string
  pathLabel: string     // "Nonstop" | "via DEN"
  why: string           // one short line
  statusLabel?: string  // "Still open" | "Tight window"
}
```

`plan.flights` or `plan.results` = array sorted by `rank`.  
On Continue / Start with this flight → set `plan.currentFlightId` and navigate to Home Current Plan.

Onboarding → first build → **must** hit Plan results before Home looks like a working day.

---

## Relationship to other screens

| Screen | Role |
|--------|------|
| **New Plan** | Capture intent → Build |
| **Plan results (F2.5)** | **First** full graded list — decision intelligence |
| **Home / Current Plan** | One current flight + watching + “N other ways” |
| **Ways** | Same Plan’s flights while working — Current / Still open / Passed |
| **Flight detail** | Deep dive one flight (pillars, load CTA) |
| **Load / Activity** | After you’re on Current Plan |

Ways can **reuse** row UI from Plan results, but Plan results is **required** on the build path even if Ways exists.

---

## Motion (2–3)

1. Enter: list rows stagger in best-first (subtle).
2. Grade letter / band settles or soft highlight on #1.
3. Confirm “Start with this flight” → brief settle → Home.

---

## Acceptance (Rork)

- [ ] After **Build my plan**, user always sees **Plan results** before Current Plan
- [ ] Every flight row shows **rank (or order), grade, flight, path, why**
- [ ] Full list visible (scroll); not only top 1
- [ ] CTA sets current and goes to **Home / Current Plan**
- [ ] No API / backend
- [ ] Traveler copy: no “options,” “primary,” “score engine,” “decision intelligence” in UI chrome
- [ ] Tabs remain Home · Plans · You

---

## One-line for Rork

**Add screen Plan results (`home/plan-results`): after Build my plan, show all ranked flights with visible grades and why-lines (decision intelligence); user continues with top pick or starts with a chosen flight, then Home / Current Plan. No backend.**
