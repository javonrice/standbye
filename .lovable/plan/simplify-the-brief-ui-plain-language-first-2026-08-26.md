# Simplify the brief UI: plain language first

Goal: someone with no aviation knowledge reads the page in 10 seconds and knows whether standby looks harder than usual today, and why. Judgment stays with them.

## What the page says

Everything gets rewritten in everyday words. No jargon on the surface.

- Header: flight number, city to city, date and time, countdown, and one big status pill.
- Verdict: one plain sentence, e.g. "Getting on this flight looks harder than usual." Followed by up to three short reasons written like a person would say them ("Storms over Chicago this afternoon", "Big event in town", "An earlier flight on this route was cancelled").
- Two cards side by side: Leaving Denver / Arriving Chicago. Each card leads with its own pill (Looks fine / Keep an eye on it / Rough) and a one-line summary.
- Inside each card, every factor is a pill row with an icon and a short label. Tapping it expands a plain-English explanation of what it means for a standby seat. No source names, no timestamps, no confidence jargon on the surface.
- One card for the flight itself: how full/late the day's chain looks, in words.
- Footer keeps the short disclaimer line.

Removed: the evidence and freshness module, source names, "Confirmed / Strong signal / Context" labels, FAA program terminology, category codes, the "unavailable data" lists (replaced by a single soft line such as "We could not check airport conditions here" when relevant).

## Visual cues do the work

- Status is carried by color + icon + pill shape, repeated consistently at every level, so scanning beats reading.
- Three states only: Looks fine (green), Keep an eye on it (amber), Rough (red). Incomplete stays a neutral gray pill with "Not enough info".
- Cards are calm and airy: generous padding, soft borders, one accent blue for interactive things only.

## Look

Cool, calm airline daylight — near-white background, deep navy text, one clear blue for actions, and green/amber/red reserved strictly for status. Existing display + body fonts stay. Card grid layout as chosen.

## Technical notes

- Presentation only. No data-model changes beyond copy: `src/lib/aircue/data.ts` gets rewritten signal titles/details and drops `source`, `retrieved`, `confidence` display usage (fields may stay unused or be trimmed).
- `SignalRow.tsx` becomes a pill-led expandable row: icon + plain label + chevron; expanded body is one paragraph of plain English.
- `StatusPill.tsx` label set changes to the three plain-language states plus the neutral one.
- `BriefView.tsx` loses the evidence section, the confidence legend, and technical wording; verdict block moves directly under the header.
- Token tweaks in `src/styles.css` for the calmer palette; no hardcoded colors in components.
- `/share/$token` and `/watches` inherit the same components automatically; both get a copy pass.
