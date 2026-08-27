# Live flight lookup on a $0 budget (AeroDataBox Basic)

Aircue starts resolving real flights from a flight number and date, and shows live flight-chain status — while staying inside 600 API units a month. Free FAA, weather, and event data stay the primary drivers of standby pressure; BTS stays the source for historical patterns.

## What changes on screen

**Home search**
- Airline + flight number + travel date become the primary fields.
- On submit, the server looks up that flight once and fills in origin, destination, and scheduled times.
- If the lookup fails, the flight isn't found, or the monthly/daily budget is spent, the form reveals the current origin / destination / departure-time fields with a calm line: "We couldn't look that flight up right now — enter your route and we'll still check conditions."
- Manual mode is always reachable via a "Enter route manually" link.

**Brief**
- Header shows the resolved route and scheduled times when live data exists.
- Flight chain card becomes partially live: selected-flight status (on time / delayed / cancelled / diverted), earlier same-route cancellations from a shared airport board, and inbound aircraft when the status response includes it.
- Anything not available reads "Not available on free flight data"; if the lookup failed or quota is out, the chain card is Incomplete — never a false Clear.
- Disclaimer unchanged: no seat counts, no standby position, no clearance odds.

## Budget rules

- Every lookup runs server-side only; the key never reaches the browser.
- A flight-number + date resolve is cached 24 hours and reused for repeat brief opens.
- Airport boards (used for earlier same-route cancels) are cached per airport per hour and shared across all watches.
- Watch refresh cadence: no flight calls more than 3 days out, at most 1–2 per day inside 72 hours, every 2–4 hours on the day of travel. FAA and weather keep refreshing on the existing cadence.
- Two guards: 20 resolves per device per day, and a global soft stop when estimated remaining units drop below 50. Either one trips manual mode.
- Calls are serialized to 1 per second with backoff on rate-limit responses.

## Technical notes

Secret `AERODATABOX_RAPIDAPI_KEY` (I'll prompt for it) plus flag `AERODATABOX_ENABLED`.

New `AeroDataBoxFreeProvider` implementing the existing `FlightProvider` interface in `src/lib/aircue/flight-provider.server.ts`; `getFlightProvider()` returns it when the key and flag are present, otherwise `ManualFlightProvider`.
- `resolve()` — one Tier-2 flight-status call by number + local date, cached 24h in `source_cache` under `adb:status:{FLIGHT}:{date}`.
- `getStatus()` — reads the cache; refreshes only when the watch cadence allows.
- `getEarlierRouteCancellations()` — FIDS departures for the origin on the travel day, cache key `adb:fids:{IATA}:{date}:departures`, 1h TTL; filtered to same carrier, same destination, earlier scheduled time, cancelled.
- `getInboundAircraft()` — from status includes only; no extra call.

Tier 3/4 endpoints are not used.

Migration: `api_usage_log` (provider, endpoint, tier_est, units_est, trip_id, created_at) with RLS enabled, no anon/authenticated policies, and grants to service_role only — it is written from server code and read by admin queries. Also a small helper to sum the current month's `units_est` for the soft stop.

`trips.provider_ref` gains `{ provider, plan, last_status_at, raw_status_id, units_estimated }`, and `flight_provider` is set to `aerodatabox` on resolved trips.

Server changes: `src/lib/aircue/aerodatabox.server.ts` (fetch, rate limit, unit logging, budget check), provider wiring, `createBrief` accepting either a flight number or manual route, and the flight-chain rollup in `pipeline.server.ts` reading live status. Watch cadence in `src/routes/api/public/run-watches.ts` gains the flight-call tiering above without changing its existing FAA/weather refresh.

Push alerts are noted as a later step — they need a public callback route and are not part of this pass.

## Not in this pass

Flight Alert PUSH subscriptions, paid tiers, deep history from AeroDataBox, aircraft/fleet browsing.
