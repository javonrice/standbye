# Fix manual route entry: always pick a real flight

Manual entry can currently produce a brief for a flight that was never looked up. Three confirmed causes in the search flow:

1. **The flight list is skipped when a flight number is still typed in.** Manual mode is often entered *after* a failed flight-number lookup, so the number stays in the field. The manual path only searches the route when the flight-number field is empty, so it jumps straight to building a brief from the route plus an unresolved number.
2. **No flights found still builds a brief.** When the route lookup returns nothing (or is rate-limited), the code shows a soft notice and creates a brief anyway, with no real leg behind it — the "false brief".
3. **Airline stays locked to United.** Manual mode defaults the airline selector to UA, so the route lookup filters out every other carrier and commonly returns an empty list even when flights exist.

## What changes

- In manual mode, always run the route lookup for From / To / date and show the flight picker — the flight number field is ignored (and hidden) once the user is entering a route.
- Default the airline to **All airlines** as soon as manual mode is turned on, so the picker shows every carrier on that route. The user can still narrow it.
- Show the picker even when there is exactly one flight, so the user confirms the leg rather than being pushed into a brief.
- If the lookup returns no flights: stop and show a clear message ("No scheduled flights found on that route for that date — check the date or airports") with the option to try a different airline/date. Do not build a brief.
- If the lookup fails for a service/quota reason: say so plainly and offer a retry. Still no auto-built brief.
- Keep the searching animation firing only after a leg is chosen.

## Technical notes

- `src/routes/index.tsx`: split the mutation into a clear "resolve by flight number" path and a "resolve by route" path keyed on `manual`, drop the `!flightNumber` guard, remove the silent `create(...)` fallback for the no-legs case, force `airline` to `ALL_AIRLINES` when `manual` is enabled, and always populate `legs` rather than auto-selecting `legs[0]`.
- Distinguish `found.reason === "not_found"` from other failures for the two messages above.
- `route-search.server.ts` needs no change; the empty result it already returns is what drives the new message.
