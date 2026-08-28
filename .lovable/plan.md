# Escape redesign — presentation only

Keep every piece of Escape logic as-is: route discovery, ranking, API calls, persistence, the specific-airport check. This changes only how the results are presented.

## The new Escape results screen

One question drives the page: "What should I try right now, and what's my way out if that fails?"

1. **Header** — `IAH → ORD`, long date, and one confident line: "Standbye found 11 realistic ways to get you home."
2. **Best move** — a single hero card for the top-ranked option (often the nonstop). Judgment face + plain verdict ("Try the nonstop first"), flight number, a route line with departure and arrival times under the endpoints, then natural-language reasoning instead of a label grid:
   - "Limited availability, but operations are normal"
   - "3 later nonstop shots if this one doesn't work"
   - "Recovery Room: Good"
   - Primary button: View this flight.
3. **If that doesn't work** — one **Best escape route** card: `Via DFW` dominant, city underneath, a visual path `IAH → DFW → ORD` with the middle airport largest, then `3 shots in · 3 shots home`, `+13 min flying time`, `Recovery Room: Great`, and Standbye's one-line reason. Button: See DFW route.
4. **Other ways home** — the next 3 gateways/connections only, as quiet single-line rows (`Via AUS   2 in · 2 onward  ›`). No accordions.
5. **Show all 11 routes** — reveals the full list in the same quiet row style.
6. **Know a route Standbye missed?** — the existing specific-airport check stays, moved to the bottom and visually calmer.

Nonstops and escape routes get visibly different treatments so they don't read as the same component: nonstops keep the flight-forward layout, escape routes lead with the path and the intermediate airport.

## The new route-detail screen

Tapping any escape route opens a dedicated screen (not an accordion):

- Judgment face + "STRONG ESCAPE ROUTE"
- Big path: `IAH → DFW → ORD` with the intermediate code dominant and the city under it
- `+13 min in the air vs nonstop`
- **GET OUT OF HOUSTON** — the realistic first-leg shots as tappable rows (time, flight, chevron)
- **ONCE YOU'RE IN DALLAS** — the useful onward departures
- **RECOVERY ROOM** — colored state + plain-English explanation, including that a connection means clearing standby twice
- Actions: "Use DFW as my escape" and "Check another route"

## Copy changes

- "If it doesn't work: Good" becomes "Recovery Room: Good/Great/Poor" everywhere in Escape.
- Judgment first, explanation second, raw data on the detail screen.

## Technical notes

- `src/routes/_authenticated/escape.$planId.tsx` is rewritten for the new hierarchy; the gateway accordion added earlier is removed in favor of the detail screen.
- New route `src/routes/_authenticated/escape.$planId.via.$hub.tsx` reads the already-persisted `plan.gateways` via the existing `getPlan` server function and renders the detail screen. No new server functions, no new queries, no migration.
- New presentational components under `src/components/aircue/`: `RoutePath` (airport-code path line), `EscapeHeroCard` (best move), `EscapeRouteCard` (best escape), `EscapeRouteRow` (quiet list row).
- All values come from existing `StandbyOption` and `GatewayOption` fields (`inboundShots`, `onwardDepartures`, `onwardCount`, `recoveryState`, `recoveryLabel`, `addedMinutes`, `caveat`, `summary`, `pillars`, `evidence.recovery`).
- Existing design tokens, fonts, radii, and bottom navigation are preserved; more whitespace, fewer nested borders.
