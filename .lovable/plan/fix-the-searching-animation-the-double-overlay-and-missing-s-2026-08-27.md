# Fix the searching animation, the double overlay, and missing seat data

## What's wrong today

1. **Overlay appears twice.** Pressing "Check standby pressure" runs a flight lookup behind the full "Building your standby brief" screen. When the number flies several legs that day, the overlay disappears, the leg picker appears, and picking a leg starts the same overlay again from step one.
2. **Dead gap at the end.** The overlay is tied only to the request that builds the brief. It unmounts the moment that request returns, but the brief page still has to load its data, so you get a blank pause before results appear.
3. **The animation is off.** The step list advances on a fixed 1.4s timer regardless of what is actually happening, so it can finish long before the brief does and then sit still. The plane also drifts off the arc it is supposed to be tracing.
4. **No seats in results.** Confirmed cause: the inventory check is capped at 3 checks per device per month and this device has already used 7 this month, so the check is skipped and the brief records "AirCue inventory check (monthly limit reached)". Nothing is broken in the probe itself.

## What I'll build

**One continuous searching screen**
- Give the overlay two phases: "Finding your flight" while the flight number is being resolved, then "Building your standby brief" once a leg is locked in.
- If several legs come back, the overlay closes into the leg picker as a deliberate hand-off rather than a hard flash — picking a leg resumes the same screen at the second phase instead of restarting from the top.
- Keep the overlay up through navigation until the brief page has its data, so the animation ends exactly when results appear.

**Better animation**
- Pace the checklist to real elapsed time: steps advance with a slowing curve and the final step stays active (never "all done") until the brief is actually ready, then all ticks complete at once as the results land.
- Put the plane on the arc path itself so it follows the route accurately, and soften the radar sweep so the rings and grid line up.

**Seat availability**
- Reset the inventory-check usage recorded for your device and raise the per-device monthly allowance to 25 so testing works; the global monthly cap stays in place.
- When a check genuinely can't run because the allowance is used up, the brief shows a clear line — "You've used your inventory checks for this month" — with a placeholder "Get more checks" button that is visibly not wired up yet. Other reasons (no flight number, lookup failed) keep a plain "Seat availability check wasn't available for this flight" line.

## Technical notes

- `src/routes/index.tsx`: single `phase` state (`resolving` | `building` | `navigating`) drives one `SearchingOverlay`; overlay stays mounted across `navigate()` until the brief route's loader resolves.
- `src/components/aircue/SearchingOverlay.tsx`: `phase` prop, elapsed-time step pacing with a completion signal, plane moved onto the SVG path (`offset-path`/`animateMotion`) and matching keyframe cleanup in `src/styles.css`.
- `src/lib/aircue/serpapi-flights.server.ts`: `DEFAULT_DEVICE_MONTHLY_CAP` 3 → 25; the `device-cap` reason is surfaced distinctly from other failures through the brief view model.
- `src/components/aircue/BriefView.tsx`: render the unavailable inventory reason with the placeholder upgrade prompt.
- One-off data change: delete this device's rows from `serpapi_usage_log`.
