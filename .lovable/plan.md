# Wire live flight impact into the score

Today the live flight signals (your flight's own status, earlier cancellations on your route) render on the Flight Chain card but are deliberately excluded from the score. Confirmed in `src/lib/aircue/pipeline.server.ts`: every live chain draft is written with the internal category `chain_status`, and that string is filtered out of the overall status, the pressure index, the "why" blurb, and the change events, while `levelFor` forces it to `incomplete`. So a brief can say "2 earlier flights cancelled" and still read Clear with a low gauge.

This change makes those signals count, keeping the existing structure and copy style.

## What changes for the traveler

- Your flight showing cancelled or diverted moves the brief to Active disruption with a high pressure reading.
- Your flight running late moves the gauge and pushes the brief to at least Watch.
- Earlier cancellations on your route raise the gauge and the face, with copy explaining that displaced passengers get rebooked onto later departures.
- Earlier flights on your route running late (15+ minutes) become a new, milder signal on the same data we already pull.
- On-time flight, aircraft tail/model, and "inbound not available" stay informational and never inflate the score.
- "What changed" now fires when your flight flips to delayed or cancelled, when earlier cancellations appear, and when they clear.

## Technical changes

`src/lib/aircue/pipeline.server.ts`
- Recategorize live chain drafts to real PRD categories: own cancel and earlier-route cancels → `cancellation`; own delay/divert/on-time and earlier-route lates → `flight`; tail/model and inbound-unavailable → `aircraft` (severity 0, confidence `context`). The manual/no-flight-number stub stays context severity 0.
- Remove the `!== "chain_status"` exclusions in `overallStatus`, the `pressureIndex` call site, `whySummary`, and the `recordChanges` material loop.
- Drop the `chain_status → incomplete` short-circuit in `levelFor` so per-signal levels follow severity.
- Chain card status: derive from chain-location drafts with the normal severity rules instead of forcing incomplete.
- Keep severities as already coded (cancel 95, divert 85, delay `min(80, 40 + mins/3)`, earlier cancels `min(80, 40 + N*15)`), add earlier lates `min(60, 25 + N*10)`.
- Material set stays `severity >= 30`; severity-0 context rows never count.
- Add fixed headline/why templates for the new top-severity cases: own flight cancelled, own flight late, earlier cancellations upstream.
- Trim `CATEGORY_MAP` so DB category and view category agree.

`src/lib/aircue/flight-provider.server.ts`
- Extend the earlier-route helper to also count same-route, same-carrier departures before yours that are delayed 15+ minutes, reusing the departures board already fetched (no extra API call, same 12-hour gate).

Database: `signals.category` already accepts `cancellation`, `flight`, and `aircraft`; a migration is only needed if a constraint rejects one of them.

Out of scope: SerpAPI seat inventory in the score, inbound aircraft ETA, Route Day board, any scraping.

## Verification

- Cancelled flight → Active disruption, pressure well above baseline.
- On-time flight with 2 earlier cancels → Watch/Elevated, why mentions the earlier cancellations.
- On-time flight, quiet route and weather → still Clear, low pressure.
- Aircraft tail/model alone leaves the score untouched.
- Refresh after cancels clear emits a resolve event and the gauge drops.
