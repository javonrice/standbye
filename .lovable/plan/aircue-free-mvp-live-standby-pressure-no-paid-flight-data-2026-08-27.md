# Aircue free MVP — live standby pressure, no paid flight data

Goal: replace the mock brief with a real one. A user enters flight number, date, origin and destination; the server pulls FAA, aviation weather and NWS data, turns it into signals, scores standby pressure, and stores the brief. Watching a flight refreshes it on a schedule and records what changed — all alerts stay in the app, no email in this pass.

## What changes on screen

**New home: "Check a flight"**
Replaces the map/My-flights sheet as the entry point. Four fields: flight number, travel date, origin airport, destination airport, plus optional departure time. Airport fields autocomplete from a seeded list of ~200 US airports. Helper line: "We'll connect live flight lookup soon — confirm your route for now." Recent flights list stays underneath so nothing is lost.

**Brief page**
Keeps the current look: orb hero, status wording, pressure bar, glass cards. Content becomes live:
- Hero status: Clear / Watch / Elevated / Active disruption / Incomplete.
- Pressure bar shows a real 0-100 standby pressure index, labelled "Standby pressure" (never odds of a seat).
- Departure and arrival cards list real weather, airport-operations and FAA-program signals; arrival also gets event context.
- Flight chain card always reads "Flight data not connected" with a short explainer.
- What changed lists real diffs between refreshes.
- A soft line naming anything that couldn't be checked, and the required disclaimer at the bottom.

**Watching**
Watch a flight from the brief. The watches screen lists active and ended watches with their in-app change feed and last check time. No emails.

**Static pages**: disclaimer / privacy / not-affiliated, linked from the footer.

## Rules that matter

- If FAA or weather for either airport fails, the brief is Incomplete — never a false Clear.
- Events are context only, with directional wording ("inbound demand may be elevated"), never "the flight will be full".
- A signal only shows if its time range overlaps the flight window (departure −2h to +4h, arrival +2h).
- No seats, no standby position, no clearance chance anywhere.

## Technical notes

Enable Lovable Cloud for the database.

Tables (per the brief, with RLS and grants): `airports`, `curated_events`, `trips`, `briefings`, `signals`, `watches`, `change_events`, `source_cache`. Notifications table is created but unused this pass. Guest briefs allowed (nullable user_id); public read on airports/curated_events, briefs readable by share id.

Seeding via migration: ~200 US commercial airports with IANA timezone and coordinates, plus curated events (Lollapalooza, Thanksgiving, NYE, known convention weeks).

Server code as TanStack server functions under `src/lib/aircue/`:
- `sources.server.ts` — cache-first fetchers for FAA NAS status, AWC METAR/TAF, NWS points/forecast/alerts, all keyed `{source}:{scope}:{id}` in `source_cache` with the TTLs from the brief and an identifying User-Agent for NWS.
- `normalize.server.ts` — raw payload to `SignalDraft` with confidence, severity, fingerprint.
- `pipeline.server.ts` — the 10 steps: load trip, fetch, normalize, window filter, directional event filter, dedupe, card rollup, overall status, pressure index, persist + diff into `change_events`.
- `flight-provider.server.ts` — `FlightProvider` interface with `ManualFlightProvider` returning null for live methods; Phase 2 adapter slots in here.
- `briefs.functions.ts` — `createTrip`, `generateBrief`, `getBrief`, `startWatch`, `listWatches`.

Refresh: a `/api/public/cron/run-watches` route with the managed cron helper, adaptive `next_check_at` cadence (24h far out, down to 30-60 min inside a day, ended 3h after arrival). Only watched trips are polled; opening a brief regenerates on demand.

If live sources fail in preview, fall back to the seeded UA782 DEN→ORD demo brief, labelled demo in dev only.

Existing mock `src/lib/aircue/data.ts` is retired once the pipeline is live; `BriefView`, `SignalRow`, `StatusPill` keep their shapes and are re-typed against the database rows.

## Not in this pass

Emails and verification, paid flight lookup, live flight status, inbound aircraft, earlier route cancellations, BTS history, buddies functionality beyond the current placeholder.
