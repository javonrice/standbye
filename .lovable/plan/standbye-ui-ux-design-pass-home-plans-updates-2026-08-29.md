# Standbye UI/UX design pass — Home / Plans / Updates

A presentation-only pass. No changes to routes, server functions, ranking, watch semantics, event logic, or database. Every edit lands in components and route markup, using the existing Standbye tokens (`fine` / `watch` / `rough`, `card`, `shadow-card`, Outfit display + Plus Jakarta body).

## Shared foundations

- Add a small set of shared presentation primitives in `src/components/aircue/` so screens stop diverging:
  - `Screen` — one page wrapper with consistent mobile padding, max width, top spacing, and bottom padding that clears the fixed nav plus safe area.
  - `SectionHeading` — one uppercase/eyebrow + title treatment used across Plan Detail, Plans, Updates.
  - `EmptyState` — icon-free, copy-led empty block with a single CTA (used by Plans, Updates, no-options).
  - `StatusLine` — plain text status line (watch state, plan health) replacing extra pills.
- Rule applied everywhere: one judgment chip per row maximum, status expressed in words and weight rather than color; `rough` tone reserved for genuinely meaningful changes.

## Bottom navigation

- Keep Home / Plans / Updates / You exactly as-is functionally.
- Larger touch targets (min 48px), tighter icon+label rhythm, clearer selected state (filled icon weight + label color + subtle active background pill on mobile), proper `env(safe-area-inset-bottom)` padding, and a hairline that reads as one surface with the page.
- Unread affordance on Updates: a small dot when a watched plan has unseen changes (uses the count already returned).

## Home (`/plan`)

- Builder dominates: wordmark, then the "Where are you trying to go?" question, then the field card at full visual strength; supporting copy tightened.
- Search preferences collapse into a single quiet disclosure row; routing/nearby/carriers stay inside it.
- "Build my plan" becomes the one high-emphasis CTA, full-width, comfortable thumb reach.
- "Stuck right now? Widen a plan" and "Already have a flight in mind?" become two compact, clearly secondary text-links/rows — not cards.
- Recent searches: compact two-line rows (`ORD → SFO` / date), muted, divided list, deliberately disposable — visually nothing like a Plan card. Section label "Recent searches".

## Plans (`/plans`)

- Replace the dense divided list with standalone plan cards, spaced, scannable in this order: route (largest element) → date → primary flight → watch state → plan health / backup runway.
- Watch state as text with a small leading dot; "Worth another look" gets weight and `rough` text, not a red card.
- Not-watched plans read calmly ("Not watching yet") without looking broken.
- Empty state: "No plans yet" + "Choose a primary option or ask Standbye to watch a trip and it'll show up here." + `Build a plan` button.

## Plan Detail (`/plans/$planId`)

Re-rank the hierarchy without moving logic:

1. Header — `ORD → CMH` large, then date and travelers on one muted line; plan health as a quiet status line rather than a pill.
2. Primary block — `Your primary option` when set (strong, framed, clearly the commitment) vs `Best move right now` when not (labeled as Standbye's current ranking, not a commitment). The two states are visibly different: the committed one gets the emphasized surface.
3. Standbye's preference — separate, informative, low-alarm line: "Standbye currently prefers UA 1847" + one-line reason + a plain "Make this my primary" action.
4. Watch block — the emotional peak. Pre-watch: heading "Keep an eye on this plan", the "whole plan, not just X" explanation, and a full-width primary CTA "Watch my plan". Post-watch: transforms in place into a reassuring "Standbye is watching" / "No important changes" / last-checked / "N realistic ways remain", with `View updates`, `Recheck now`, `Stop watching` as equal-weight quiet actions.
5. Backup runway — small text block: headline count plus a two-line breakdown; no chart, no card stack.
6. Other good options — clearly secondary heading and lighter rows.
7. Ways in this plan and Widen — kept, pushed below, Widen styled as a calm recovery row.

## Option rows and Option Detail

- `StandbyOptionRow`: tighten to flight identity, times, route, judgment chip, and up to three signals; reduce competing font sizes; secondary variant (lighter border, no primary tint) for the "other options" list so the primary stays dominant.
- Option Detail becomes visibly an evidence screen, not a second Plan Detail: flight identity + timing header, judgment with Standbye's explanation, then evidence sections (availability, operations, recovery, history, reported load) in one consistent rhythm. `Make this my primary option` is the single sticky-feeling primary action. No watch controls introduced.

## Updates (`/updates`)

- Quiet state promoted to a real state: large "All quiet", "Standbye is watching N plans.", "Nothing needs your attention right now." — no bordered box competing with it; the watched-plan list below is compact and muted.
- Meaningful state: card per plan leading with "Worth another look", route, what changed, why it matters (backup runway movement, primary status), then `Review plan`. Calm operational tone, no alarm colors beyond the `rough` accent on the label.
- One coherent visual system for all event types: same card shape, differentiated by wording and a single leading label — no per-type colors.
- No-watches empty state distinguished from All quiet.

## You (`/you`)

Light consistency pass only: same page wrapper, heading scale, card/section styling, and row rhythm as the rest. No functional change.

## Technical notes

- Files touched: `src/components/aircue/MainNav.tsx`, `StandbyOptionRow.tsx`, `PlanDetailSections.tsx`, `CueBadge.tsx` (usage only), `DetailScreen.tsx`, plus new shared primitives; routes `plan.index.tsx`, `plans.index.tsx`, `plans.$planId.index.tsx`, `updates.index.tsx`, `options.$optionId.index.tsx`, `you.tsx`.
- `src/styles.css` gains only additive tokens if needed (e.g. a subtle elevated-surface value); no palette restart.
- All data access, query keys, mutations, and props stay as they are; changes are markup and class-level.
- Verification: typecheck, existing test suite, and a mobile-viewport pass (iPhone-sized) through Home → Plan Detail → Option Detail → primary → watch → Plans → Updates, plus a desktop sanity check.
- If the pass surfaces a real logic problem (for example a plan showing on the wrong surface), it gets reported rather than fixed inside this pass.
