# AirCue sellable tightness probe (SerpAPI)

Adds one new AirCue signal to each brief: is this flight still selling many economy seats publicly, only a few, or none. Output is `9+`, the exact party size N (1–8) at which the flight was still bookable, or `0` — never standby position or clearance odds. When it's 1–8, the UI shows the number, e.g. "only about 4 sellable seats left in this search".

## What the user sees

A new signal row in the flight chain section titled **AirCue inventory check**:

- 9+: "Public booking inventory still shows 9 or more sellable seats in economy for this flight."
- 1-8: "Public booking inventory looks limited — about {n} sellable seats in this search."
- 0: "This flight is not offering sellable economy seats in the public booking search."

Every row keeps the same why-it-matters line: standby flexibility often tracks how aggressively a flight is still being sold; this is a coarse public check, not airline load data. The existing disclaimer footer stays as-is. Wording never uses seat totals, "you'll clear", or the name AirQ.

If the check can't run (no key, kill switch off, monthly cap hit, or an error), the brief still scores from FAA/weather and the category is listed as unavailable — it is never treated as "looks loose".

## Probe logic (frugal)

1. Look for a fresh flight-level cache entry; return its bucket if found.
2. Otherwise run one route-level search at `adults=9` for the carrier/origin/dest/date and cache it — that one call covers every flight in the bank that day.
3. Target flight present with a price at 9 adults → bucket `9+`.
4. Not present → step down 7, 5, 4, 3, 2, 1 and stop at the first hit → bucket `1-8` with the largest N found.
5. Never present → bucket `0`.

Typical cost: 1 search for soft banks, 2-4 for tight flights. No blind 1..9 loop.

## Scoring

| Bucket | Severity | Lean |
|---|---|---|
| `9+` | 15 | mild softness; on its own does not force Clear when other pressure exists |
| `1-8`, n ≥ 4 | 45 | watch |
| `1-8`, n ≤ 3 | 65 | elevated |
| `0` | 80 | strong tight |
| missing/error | — | category marked unavailable |

Confidence is `strong`, so it enters the existing weighted pressure index at the strong weight.

## Watches

On a watch refresh, re-probe only when the cache expired or the previous bucket was `9+`. If the bucket falls from `9+` to `1-8` with n ≤ 3, or to `0`, write a What-changed event: "AirCue: sellable inventory dropped from 9+ to tight". Cap at ~5 probes per watched trip, reusing the existing adaptive watch schedule — no new polling loop. No email in this pass.

## Quotas

- Guest/device: 3 probes per calendar month; when capped the UI reads "AirCue inventory check limit reached — pressure signals above still apply."
- Watched trips prefer cache and probe only on their schedule.
- Global soft stop when the logged monthly probe count crosses a configured ceiling.

## Technical notes

- New server-only module `src/lib/aircue/serpapi-flights.server.ts`: SerpAPI `engine=google_flights`, `type=2`, one-way, `travel_class=1`, `include_airlines=<carrier>`, `stops=1` with a `stops=0` retry, `hl=en/gl=us/currency=USD`. Match rule: a single-segment itinerary in `best_flights`/`other_flights` whose normalized flight number equals the trip's (e.g. `UA 4824` → `UA4824`) and that has a price.
- Caching reuses `source_cache` with keys `serpapi:route9:{CARRIER}:{O}:{D}:{DATE}` and `serpapi:sellable:{CARRIER}:{O}:{D}:{DATE}:{FLIGHT}`. TTL 120 min, 60 min inside 6 hours of departure.
- `pipeline.server.ts` calls the probe alongside FAA/weather/chain and pushes a `SignalDraft` with `location: "chain"` (stored as `flight_chain`), `category: "sellable_tightness"`, evidence `{ bucket, largest_n, engine, adults_tested, flight_matched, retrieved_at }`, fingerprint `sellable:{carrier}:{flight}:{date}:{bucket}:{n|x}`. The `signals` table has no category check constraint, so no migration is needed there; `CATEGORY_MAP` in the pipeline gains a UI mapping so the row renders.
- New migration creates `serpapi_usage_log` (purpose, route_key, flight_label, adults, bucket, device_id, trip_id, created_at) with indexes on `(device_id, created_at)` and `(created_at)`, plus GRANTs to `service_role` only, RLS enabled with no public policies — it is written from server code exclusively. A monthly-count helper mirrors `api_units_this_month`.
- Env, server-side only: `SERPAPI_API_KEY` (secret, requested during build), `SERPAPI_ENABLED`, `AIRCUE_SELLABLE_CACHE_TTL_MIN`, `AIRCUE_FREE_SELLABLE_PROBES_PER_MO`. Read inside handlers, never `VITE_`, never called from the browser.

## Out of scope

United `#standby` scrape, credits/Stripe metering, Return Guard, any claim of portal-accurate open seats.
