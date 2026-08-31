# Pass 3 Final Correction — presentation-only fixes

Five targeted fixes to the Pass 3 implementation. No redesign of Option Detail, evidence panels, or LoadTask. No backend, ranking, scoring, eligibility, provider, or screenshot-infrastructure changes. Pass 4 does not start.

## 1. Rename "Public availability" → "Booking check"

File: `src/routes/_authenticated/options.$optionId.availability.tsx`

- Route head metadata: `title` and `og:title` become "Booking check — Standbye"; `og:description` reworded (e.g. "What the public booking check found.").
- `DetailShell` title prop: `"Public availability"` → `"Booking check"`.
- Body copy: replace feature-name usage of "Public availability" with "public booking signal" phrasing (e.g. "The public booking check did not return a usable answer…").
- No changes to the availability evidence, scoring, or route path (`/options/$optionId/availability` stays).

## 2. Remove duplicate evidence links on Option Detail

File: `src/routes/_authenticated/options.$optionId.index.tsx`

- WHY THIS RANKS HERE keeps exactly three rows: Booking check, Operations, Backup runway.
- MORE CONTEXT keeps Route history and Holiday demand (when applicable).
- Remove the "Weather" link from MORE CONTEXT (line ~124) — Operations already links to `/options/$optionId/context/weather` (Operating Conditions screen), so the duplicate goes.
- Ranking/pillar calculations untouched.

## 3. Remove invented quantitative bars from qualitative history

File: `src/routes/_authenticated/options.$optionId.context.history.tsx`

- Delete `scaleFor()` (line ~31) and its two uses (`fill={scaleFor(history.delayPattern)}`, `fill={scaleFor(history.cancelPattern)}`).
- Render delay/cancellation patterns as plain facts (e.g. "Late departures — Often delayed", "Cancellations — Rare") with no derived bar magnitude.
- Bars remain only where the evidence has a real numeric metric; nothing else on the screen changes.

## 4. Replace developer-language screenshot fallback

File: `src/components/aircue/LoadTask.tsx` (line ~340)

- "Screenshot parsing is not configured on this environment yet. You can still enter…" → "Screenshot reading isn't available right now. You can still enter the load manually."
- Screenshot infrastructure unchanged.

## 5. Strengthen the load payoff

File: `src/components/aircue/LoadTask.tsx` (payoff block)

- Keep the existing before/after rank comparison.
- When exactly one meaningful ranking change occurred, render it as the dominant payoff:
  - "✓ Plan updated"
  - "UA 1847 moved from #3 → #1" (large)
  - "Your load changed the order."
- When no order changed, retain: "Your order did not change — the numbers backed up what Standbye already thought."
- Multiple changes: list them compactly under the "Plan updated" heading.
- Ranking logic unchanged.

## Verification

1. `bunx tsgo --noEmit` clean.
2. `bun test` — expect same baseline (174 passing, 6 pre-existing watch-signal failures).
3. Authenticated 390×844 browser inspection: Option Detail (three-row WHY + deduped MORE CONTEXT), all five evidence routes, screenshot load flow (new fallback copy), manual load flow, and both payoff variants.
4. Stop for review. Pass 4 not started.
