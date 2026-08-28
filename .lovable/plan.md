# Escape: alternate-routing semantics + redesign

Escape stops being "Plan with more results." When someone taps Escape they have already rejected the obvious answer, so Escape ranks and presents alternate routings first and demotes nonstops to a footnote.

The routing engine itself is preserved — this changes Escape's ranking objective, what counts as an Escape result, and the whole presentation.

## 1. Semantics and ranking

- **Nonstops are not Escape routes.** They are still fetched (they feed recovery room, later-shot counts, and the footnote), but they are excluded from the ranked Escape list and from the headline count.
- **Escape results are connections through intermediate airports**, ranked by an Escape-specific objective that weights, in order: can I actually leave this airport (first-leg shots and availability), do I have several usable ways to finish once I'm there (onward shots), Recovery Room, operations at the connecting station, connection feasibility, then detour/elapsed time and the two-clear penalty.
- This intentionally lets a small station like OKC beat a big hub like DEN when the hub is operationally poor or the onward options are thin.
- Headline copy counts alternates only: "Standbye found 8 alternate ways to get to Chicago." Nonstops are counted separately.
- Empty-state stays honest: if no alternate routing works but nonstops remain, say so and point at the nonstops.

Escape's input screen already asks "Where are you now?" and "Where do you need to get?" with its own date/time — no change needed there; it stays independent of any earlier plan.

## 2. Escape results screen

```text
← Escape

Get me from IAH → ORD
Standbye found 8 alternate ways to get you moving.

── BEST ESCAPE ──────────────
🙂 Via DFW   Dallas–Fort Worth
IAH ──→ DFW ──→ ORD
3 shots to DFW · 3 useful ORD flights after
Recovery Room   🟢 Great
Extra travel    +2h 10m
Operations      🟢 Normal
Why this works: multiple ways out of Houston and
several chances to ORD afterward.
[ Use this escape ]

── OTHER WAYS ───────────────
🟢 Via OKC   1 shot in · 2 onward   ›
🟢 Via AUS   2 shots in · 2 onward  ›
🟡 Via BNA   1 shot in · 2 onward   ›
[ Show all 8 escape routes ]

────────────────────────────
Still considering nonstop?
3 later IAH → ORD flights remain
[ View direct flights ]
```

- One dominant Best Escape card; the intermediate airport is the largest element, shown on a visual path line.
- Other ways: next 3 as quiet one-line rows, with "Show all X" for the rest. No accordions — the earlier expandable gateway card is replaced by the detail screen below.
- Nonstops live in a small secondary section at the bottom only.

## 3. Route-detail screen — vertical itinerary timeline

Tapping any escape route opens its own screen, laid out like a Trip.com multi-leg itinerary rather than a card stack:

- Judgment face + "STRONG ESCAPE ROUTE"
- Big path `IAH → DFW → ORD` with the connecting code dominant and city beneath; extra travel vs nonstop
- A single vertical timeline rail down the screen, with times on the left and content on the right:
  - **GET OUT OF HOUSTON** — each realistic first-leg shot as a timeline node (time, flight, judgment, chevron)
  - a connection node between the halves: "Connect in Dallas — you clear standby again here"
  - **ONCE YOU'RE IN DALLAS** — the useful onward departures as timeline nodes
- **RECOVERY ROOM** — colored state plus plain-English rationale, including that a connection means clearing standby twice
- Actions: "Use this escape" and "Check another route" (the existing specific-airport check)

## Reference feel

Trip.com transfer results (transfer-in-X chips, clear two-leg summary), Transit and Apple Maps route alternatives (one obvious pick, quiet compact alternates), Trip.com multi-leg itinerary (the vertical timeline rail), Flighty alternate flights (calm, scannable flight rows). Standbye's own tokens, type, radii, and bottom nav stay unchanged.


## 4. Copy rules

- "Recovery Room: Good/Great/Poor" replaces "If it doesn't work: Good".
- Judgment first, explanation second, raw flight data on the detail screen.
- No availability/operations/recovery label grid on the results hero — natural sentences instead; the colored signal grid stays on the detail screen.

## Technical notes

- `rankEscapeRoutes` in `src/lib/aircue/ranking.server.ts`: keep the nonstop fetch (needed for boards, recovery, and the count) but return nonstops separately from ranked connection options, and apply an Escape-specific score adjustment favoring first-leg shot count and onward shot count over detour/elapsed. `nonstopCount` already exists and gets surfaced.
- Plan persistence keeps storing both; the results screen reads `plan.options` (connections) and filters nonstops into the footer section. No migration.
- `src/routes/_authenticated/escape.$planId.tsx` rewritten for the new hierarchy.
- New route `src/routes/_authenticated/escape.$planId.via.$hub.tsx` renders the detail screen from the persisted `plan.gateways` via the existing `getPlan`. No new server functions.
- New presentational components in `src/components/aircue/`: `RoutePath`, `EscapeBestCard`, `EscapeRouteRow`.
- Existing tokens, fonts, radii, mobile-first layout, and bottom navigation preserved; more whitespace, fewer nested cards.
