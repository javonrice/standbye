# AirCue — Routing intelligence

Keep the current pivot, design system, navigation and screens. This adds one thing: AirCue
stops thinking in flights and starts thinking in **ways to get there**.

## What changes for the traveler

Today a search returns a flat list of departures on one airport pair, and connections only
appear when nonstops are thin. After this, a search returns a **strategy**: the nonstops
worth trying, the gateways worth committing to, how many realistic shots each one gives you,
and what you still have left if the first attempt fails.

New language, used consistently: a **shot** is a flight you could realistically still attempt
and make progress on. A **gateway** is a connecting city, judged on how many ways you have
into it and how many useful onward departures wait there.

## Screens

**Plan home** — destination-first. From / To / date / travelers, then one flexibility choice:
Best options (default), Nonstop only, Any reasonable route. Watching preview stays underneath.

**Standby preferences** — becomes its own screen off Plan (not an inline panel): travelers,
cabin, routing mode, max connections (default 1), nearby airports, alternate gateways,
airlines, departure window.

**Searching** — the checklist reflects route construction: finding nonstops, looking for
useful gateways, building realistic connections, checking availability, checking operations,
comparing recovery room, ranking setups.

**Standby options** — results split into nonstop cards and gateway cards. A gateway card reads
"Via DEN · 3 ways into Denver · 6 useful flights DEN → LAX" with availability, operations and
connection-risk pillars. Footer link: "See all ways to LAX".

**All ways there** (new) — every nonstop, then every gateway ranked, with the honest caveats
(backtrack, unstable operations today) written in plain language.

**Gateway detail** (new) — "Via DEN": the list of shots into DEN, each judged; the onward
DEN → LAX departures; the recovery verdict; and "Use DEN as my plan".

**Best gateways to <city>** (new) — for multi-gateway destinations (Tokyo, London, Hawaii),
compares SFO / LAX / DEN / EWR as ways in.

**Recovery room** — becomes network-aware: later nonstops, then connection options with their
own judgments, then how much useful travel day is left.

**Compare** — can compare a nonstop against a routing: stops, availability, operations,
attempts, recovery, complexity, plus "AirCue would try UA222 first" and why.

**Watch my plan** — watches the strategy: primary flight plus backup ladder (later nonstop →
DEN → PHX), with the list of what AirCue keeps checking.

**Your best move changed** — the takeover now covers "a better route appeared", not only "your
flight got worse": what changed, what AirCue now prefers, Compare plans / Keep UA222.

**No good options** — never a dead end. Rough nonstops roll straight into the best alternate
gateway plus other gateways to explore.

**Flexible dates** — each day shows nonstop shots and connection routes, not just a mood.

## How the engine changes

Route construction becomes a small graph: origin (plus nearby airports) → destination direct,
and origin → gateway → destination. Gateways come from the origin's actual departures that
day, filtered to airports with real onward service to the destination.

A routing is discarded when the connection is impossible or unreasonable: layover too short or
too long, arrival after the onward departure, airport change required, carrier the traveler
cannot use, obvious geographical backtrack, absurd total elapsed time, a gateway with no
recovery of its own, or an unwanted overnight.

Ranking weights fresh reported load and public availability highest, then number of realistic
shots, recovery room, cancellations and own-flight status; then connection complexity and
gateway health; then weather/FAA, history and holiday context. **Failure domains** are
explicit: a connection needs two clears, so it carries a penalty and only outranks a
comparable nonstop when the nonstop tightens or the gateway offers materially more recovery.
The reason is stated plainly — "DEN gives you more ways to recover, but it requires clearing
two flights."

Externally: Favorable · Good alternate · Mixed · Riskier. Never a probability of boarding.

## Data budget

Gateway expansion multiplies flight-data calls, so the search is staged: nonstops and the two
or three strongest gateways are evaluated up front, and the rest of the gateway list is
resolved only when the traveler opens "All ways there" or a specific gateway. Boards are
cached per airport/day so a gateway examined once is free for the rest of the session.

## Technical notes

- `route-search.server.ts` gains a gateway builder (origin departures → candidate hubs →
  onward legs) with the filter rules above; `airport-groups.ts` gains destination gateway sets
  for Tokyo/London/Hawaii-style cities.
- `ranking.server.ts`: connections stop being a fallback and become first-class candidates,
  with a shot count, gateway-health signal and an explicit two-clear penalty in scoring.
- `standby.ts` gains `GatewayOption` (hub, inbound shots, onward departures, recovery state)
  and extends `RecoveryEvidence` with connection alternates.
- New routes: `plans.$planId.ways.tsx`, `plans.$planId.gateway.$hub.tsx`, `plan.preferences.tsx`.
  Existing option, compare, recovery, watching and takeover screens are extended in place.
- Watch rows store the backup ladder alongside the primary flight so a change check can say
  "your better route changed"; that needs one small migration on `watch_plans`.
- Push delivery stays out of scope — the new notification copy is defined, not delivered.
