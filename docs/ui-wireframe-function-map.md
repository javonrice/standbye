# Standbye UI Wireframe — Function Map (Clean Slate)

**Purpose:** Start-over information architecture. Map screens to **high-level product functions**. Ignore current UI, routes, and backend plumbing.

**Principle:** The traveler never learns “options,” “primary,” “watch,” or “prefs.” They only see **Plan**, **current flight**, **other ways**, and **what changed**.

---

## 1. Product object (one noun)

```text
PLAN = one origin → dest → travel day
```

Everything else is a **state or action on that Plan**:

| Internal concept (hide) | Traveler language |
|-------------------------|-------------------|
| primary option | Current flight |
| ranked options | Other ways |
| strategies / gateways | Ways there |
| watch / recheck | Standbye is watching |
| lifecycle complete | Trip done |
| reported load | Seats / standby count I saw |

---

## 2. High-level functions → screens

Five jobs. Every screen serves exactly one.

```text
① SETUP        Who am I traveling as?
② PLAN         Where am I going that day?
③ WORK         What should I try right now?
④ ADJUST       What else can I try / what changed?
⑤ ARCHIVE      What did I do before?
```

| # | Function | Screen(s) | One job |
|---|----------|-----------|---------|
| F0 | Enter / account | Splash, Sign in | Start |
| F1 | Setup traveler | Onboarding | Access + home airport |
| F2 | Create Plan | New Plan | Capture route + day |
| F3 | Work the day | Home (Current Plan) | Show current flight + status |
| F4 | See all ways | Ways | Ranked alternatives on this Plan |
| F5 | Commit / switch | (action on Ways or Home) | Make another flight current |
| F6 | Report reality | Load | Add seats/standbys to Plan |
| F7 | React to change | Activity | What changed since last look |
| F8 | Browse history | Plans library | Past + upcoming Plans |
| F9 | Profile | You | Access, prefs, help |
| F10 | Explain this flight | Flight detail | Pillars, holiday, load CTA, deeper context |

**Out of traveler vocabulary:** Escape as a mode, Updates as a tab, Option detail as a *product* (Flight detail under Home is OK), Watch as a noun.

---

## 3. Global shell

```text
┌─────────────────────────────────────┐
│                                     │
│           SCREEN BODY               │
│                                     │
├─────────────────────────────────────┤
│   Home          Plans         You   │
└─────────────────────────────────────┘
```

| Tab | Owns | Does not own |
|-----|------|--------------|
| **Home** | Current Plan + everything inside it (ways, load, activity) | List of all Plans |
| **Plans** | Library only (list) | Working a Plan |
| **You** | Profile / access / help | Trip work |

Rule: Opening a Plan from the library jumps to **Home** with that Plan as current (if actionable) or a read-only “done” view.

---

## 4. App map (flows)

```text
                    ┌──────────┐
                    │  Splash  │
                    └────┬─────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         Onboarding              Sign in
              │                     │
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │        HOME         │
              │  Has actionable     │─────── no ───► New Plan (F2)
              │  Plan today?        │
              └──────────┬──────────┘
                         │ yes
                         ▼
              ┌─────────────────────┐
              │   CURRENT PLAN      │  ← F3 WORK
              │   (Home body)       │
              └──────────┬──────────┘
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
        Ways (F4)    Load (F6)    Activity (F7)
           │
           └── switch current (F5) ──► back to CURRENT PLAN
```

Lifecycle (domain → UI language):

```text
ACTIVE + has future flight  →  Home shows Current Plan
ACTIVE + advanced primary   →  Home shows new current (no drama)
COMPLETE                    →  Home skips; Plans shows under Today → Done
travelDate < today          →  Plans → Past
```

---

## 5. Screen wireframes

### F0 — Splash

```text
┌─────────────────────────────────────┐
│                                     │
│              STANDBYE               │
│                                     │
│     Plan the standby day,           │
│     not one flight at a time.       │
│                                     │
│         [ Get started ]             │
│         I have an account           │
│                                     │
└─────────────────────────────────────┘
```

**Function:** Enter product.

---

### F1 — Setup (onboarding, 4 beats)

```text
① Traveler type     ② Home airline
③ Travel access     ④ Home airport
              →  [ Plan my first trip ]
```

**Function:** Enough access truth to rank. No education walls.

---

### F2 — New Plan

```text
┌─────────────────────────────────────┐
│  Where are you trying to go?        │
│                                     │
│  From  [ ORD            ]           │
│  To    [                ]           │
│  When  [ today          ]           │
│  Who   [ 1 traveler     ]           │
│                                     │
│  · Trip options (collapsed)         │
│                                     │
│         [ Build my plan ]           │
│                                     │
│  Have a flight number? Check it →   │
└─────────────────────────────────────┘
```

**Function:** Create one Plan. Building **is** activating (current flight + watching starts without extra taps).

Optional subpath — Known flight:

```text
┌─────────────────────────────────────┐
│  Check a flight                     │
│  Carrier + number + date            │
│  [ Check ]                          │
│  → lands on Current Plan with that  │
│    flight as current                │
└─────────────────────────────────────┘
```

---

### F3 — Home / Current Plan (the money screen)

One composition. One current flight. No dashboard clutter.

```text
┌─────────────────────────────────────┐
│  STANDBYE                           │
│                                     │
│  ORD → LAX · Mon Aug 31             │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│         UA 2110                     │
│         8:15 AM · ORD–LAX           │
│         Departs in 2h 14m           │
│                                     │
│         Favorable                   │
│         Why this makes sense…       │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Standbye is watching               │
│  3 other ways still open            │
│                                     │
│  [ See other ways ]                 │
│  [ Add what I see ]                 │
│                                     │
│  · What changed (if any)            │
│                                     │
│  New plan                           │
└─────────────────────────────────────┘
```

**Function:** Work the day — answer “what should I try **now**?”

| State | What Home shows |
|-------|-----------------|
| A. No Plan | New Plan (F2) |
| B. Active Plan | Wireframe above |
| C. Current flight just advanced | Same frame, new flight number — quiet |
| D. Plan complete (same calendar day) | Empty Home + “Today’s trip is done” + link to Plans / New plan |
| E. Next actionable Plan is tomorrow | Tomorrow’s Plan as current (or soft “nothing today”) |

**Do not put on this screen:** full option list, strategy cards, airport stats, load form, activity feed (more than one line).

---

### F4 — Ways (all ways on this Plan)

```text
┌─────────────────────────────────────┐
│  ← ORD → LAX · Aug 31               │
│  Other ways                         │
│                                     │
│  CURRENT                            │
│  ● UA2110  8:15a   Favorable        │
│                                     │
│  STILL OPEN                         │
│  ○ UA1234 10:30a   Mixed            │
│  ○ UA5678 12:05p   Favorable        │
│                                     │
│  PASSED                             │
│  · UA0900  6:00a   (gone)           │
│                                     │
│  ─ Ways there (paths) ─             │
│  Nonstop · via DEN · via IAH …      │
│  (tap path → filter list)           │
│                                     │
└─────────────────────────────────────┘

Tap a still-open row:
┌─────────────────────────────────────┐
│  UA1234                             │
│  Why Standbye ranks it…             │
│  Pillars / reasons (compact)        │
│                                     │
│  [ Make this current ]              │
│  [ Keep looking ]                   │
└─────────────────────────────────────┘
```

**Function:** Adjust — see ranked alternatives; optionally switch current (F5).

**Mapping:**

| Wireframe block | Function |
|-----------------|----------|
| CURRENT | F3 truth |
| STILL OPEN | Actionable options |
| PASSED | History of this day (read-only) |
| Ways there | Strategy / path discovery (traveler: “kinds of routes”) |

---

### F5 — Switch current (action, not a tab)

No dedicated screen. Confirm sheet on Ways or from Activity:

```text
┌─────────────────────────────────────┐
│  Make UA1234 your current flight?   │
│  Standbye will watch this one.      │
│                                     │
│  [ Yes, switch ]   [ Cancel ]       │
└─────────────────────────────────────┘
```

**Function:** Commit intent. Watch follows automatically.

---

### F6 — Load (report what I see)

```text
┌─────────────────────────────────────┐
│  ← Add what I see                   │
│                                     │
│  Which flight?                      │
│  [ Current: UA2110 ▼ ]              │
│                                     │
│  Open seats   [  ]                  │
│  Standbys     [  ]                  │
│  Cabin        [ Economy ▼ ]         │
│                                     │
│  or  [ Upload screenshot ]          │
│                                     │
│         [ Save to plan ]            │
└─────────────────────────────────────┘
```

**Function:** Feed reality into the same Plan (ranking may reshuffle; Home still owns “current”).

---

### F7 — Activity (what changed)

Not a global tab. Enter from Home one-liner or Plans → Plan.

```text
┌─────────────────────────────────────┐
│  ← What’s changed                   │
│                                     │
│  Today                              │
│  · 9:02  Current advanced to UA1234 │
│  · 8:41  UA2110 departed            │
│  · 7:15  Load updated — seats 4     │
│                                     │
│  Earlier                            │
│  · Plan built · watching started    │
└─────────────────────────────────────┘
```

**Function:** Explain motion. No separate “Updates product.”

---

### F8 — Plans library

```text
┌─────────────────────────────────────┐
│  Plans                              │
│                                     │
│  TODAY                              │
│  · ORD→LAX  Current · watching      │
│  · DEN→ORD  Done                    │
│                                     │
│  UPCOMING                           │
│  · SFO→ORD  Sep 2                   │
│                                     │
│  PAST                               │
│  · ORD→CMH  Aug 20                  │
│                                     │
│                    [ + New plan ]   │
└─────────────────────────────────────┘
```

**Function:** Archive + pick another day. **Done** ≠ calendar past — same-day completed Plans sit under Today → Done.

Tap row:

- Actionable → Home (Current Plan)
- Done / Past → Read-only Plan summary (Ways history, no watch)

---

### F9 — You

```text
┌─────────────────────────────────────┐
│  You                                │
│                                     │
│  United · Employee · ORD            │
│  Travel access: UA + partners       │
│                                     │
│  Edit access                        │
│  Notifications                      │
│  How Standbye works                 │
│  Sign out                           │
└─────────────────────────────────────┘
```

**Function:** Setup maintenance. Not trip work.

---

## 6. Function ↔ UI matrix (build order)

| Build first | Screen | Function | Success looks like |
|-------------|--------|----------|--------------------|
| 1 | New Plan | F2 | One tap builds + activates |
| 2 | Current Plan | F3 | One flight, countdown, watching line |
| 3 | Ways | F4/F5 | Switch current without leaving Plan |
| 4 | Plans library | F8 | Done vs Past clear |
| 5 | Load | F6 | Report without leaving Plan mental model |
| 6 | Activity | F7 | Changes explained in Plan language |
| 7 | Onboarding / You | F1/F9 | Access only |

---

## 7. State machine (UI only)

```text
                  build
   [no plan] ─────────────► [active]
                                │
              advance current   │  (flight passed, next exists)
                                ▼
                           [active']   ← same screen, new current
                                │
              no flights left   │
                                ▼
                           [complete] ──► Home empty / Plans Done
                                │
                         date rolls
                                ▼
                             [past]
```

Home only renders **active** (and optionally “nothing to work today”).  
Plans renders **active · complete · upcoming · past**.

---

## 8. What we deliberately do **not** wireframe

| Old / internal surface | Why dropped |
|------------------------|-------------|
| Updates tab | Activity is Plan-scoped (F7) |
| Escape as parallel product | Fold into Ways / “wider search” trip option |
| Option evidence as deep app | Sheet under Ways row |
| Compare as primary path | Optional later inside Ways |
| Strategy / gateway admin UI | Paths as filters on Ways only |
| Dashboard Home | One composition, one current flight |

---

## 9. One-page mental model

```text
         SETUP (once)
              │
              ▼
         NEW PLAN  ──create──►  CURRENT PLAN  ←── you live here
                                   │    ▲
                         ways/load │    │ switch current
                                   ▼    │
                              WAYS / LOAD / ACTIVITY
                                   │
                              when done
                                   ▼
                              PLANS LIBRARY
```

**Build UI in that order.** Backend already supports lifecycle advance/complete; UI only needs to speak **Current · Other ways · Done**.
