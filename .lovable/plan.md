# AirCue — align the app with the decision-first spec

Three steps, in order. Each one leaves the app working.

## Step 1 — Retire the legacy app

The old single-flight experience runs in parallel with the new standby engine and
contradicts it (0–100 pressure score, "Open seats 9+" next to "we don't show seats",
four bottom tabs instead of three).

- Make `/` the AirCue entry: signed out shows the First launch screen (name, one-line
  promise, "Start planning", "Sign in"); signed in redirects to Plan.
- Remove the legacy surfaces: Check home, Route Day board, Buddies, Watches, Brief,
  Share, and the old `BottomNav`. Keep Plan · Watching · You as the only navigation.
- Retire the briefing pipeline and its pressure index. The ranking engine's
  Favorable / Mixed / Riskier / Plan changed becomes the only verdict language.
- Fold the honest seat language from Availability detail into every place availability
  is shown, so the seat contradiction disappears with the old brief.

## Step 2 — Close the engine gaps

Today the engine only evaluates nonstop flights between two exact airports, which is why
routes like DAY → SFO come back with nothing.

- **Connections.** Build one-stop options through the carrier's hubs so the ranked list
  can show ORD → SFO → HND, and mark them as needing two clears.
- **Nearby and multi-airport.** Let a search cover a city (Tokyo = HND + NRT) and
  optionally nearby origin airports.
- **Honest empty states.** Distinguish "no service on this route", "the day is over",
  "your airline filter is too narrow", and "we couldn't reach the flight data right now".
  Today all four render the same card.
- **Recovery room** gains alternate routings, not just later nonstops.
- Remove the eight-flight cap so late-day and busy routes aren't silently truncated.

## Step 3 — The missing screens

- **Search preferences** — travelers, cabin, routing (nonstop / 1 stop / 2 stops),
  nearby airports, airline mode, departure window. Opened from Plan, not crammed onto it.
- **Plan changed** — a full-screen takeover when the flight cancels, naming the best
  remaining option instead of quietly downgrading a pillar.
- **No strong setup** — the best-available option plus "check the day before" and
  "try nearby airports".
- **How AirCue works**, Data sources, Privacy, and Saved airports under You.
- **Flexible dates** — best days around the trip, once nearby-date search exists.

## Not in this pass

Push notifications. Notify mode is stored but nothing delivers yet; that needs a
delivery channel decision (web push vs email) and is worth its own step.

## Technical notes

- Legacy removal touches `pipeline.server.ts`, `brief.functions.ts`, `sources.server.ts`
  consumers, `BriefView`, `StatusPill`, `SignalRow`, `HistoryPanel`, `BottomNav`, and the
  `/brief`, `/share`, `/routes`, `/watches`, `/buddies` routes. Legacy tables (trips,
  briefings, signals, watches) stay in the database untouched; only the code paths go.
- Connections and nearby airports extend `route-search.server.ts` and
  `ranking.server.ts`; the option row already carries `kind: "connection"` and a
  `segments` array, so no migration is needed.
- Empty-state honesty means threading `budgetBlocked` and a reason code out of
  `rankStandbyOptions` instead of discarding it.
- Saved airports and routing preferences extend `standby_profiles`; that needs one
  small migration.
