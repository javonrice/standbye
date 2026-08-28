## Ranking and judgment

Internally each option gets a score from four pillars — Availability, Operations, History, Recovery — plus a reported load when present. The score never reaches the screen. It maps to one of four labels:

- Favorable — nothing meaningful is working against you
- Mixed — a real tradeoff exists
- Take another look / Riskier — pressure has built or backups are thin
- Plan changed — the flight is cancelled or the plan is no longer viable

Confidence is separate from the label: Low / Medium / High, driven mostly by whether a recent reported load exists and how many pillars actually returned data. A missing pillar lowers confidence; it never lowers the label.

Recovery Room is computed as a first-class pillar: later nonstops and alternate routings that still connect, plus how much useful travel day remains.

## Watching and meaningful change

A watch stores the plan (option + its pillar snapshot), not just a flight number. Each recheck compares pillar states, and only crossings that would change the decision — availability tier drop, earlier cancellation on the route, own-flight cancel/major delay, a backup becoming unusable, an airport/FAA condition — produce a change event, a timeline entry, and a notification. Ordinary status noise is discarded.

## Technical notes

- New tables (staged as an additive migration, applied when you accept the draft): profiles, standby_profiles, plans, plan_options, option_signals, reported_loads, watch_plans, change_events, saved_airports, notification_prefs. Row-level security scopes everything to the signed-in user.
- Auth: email/password plus Google, with an `_authenticated` layout gating Plan / Watching / You; the welcome screen stays public.
- Existing services are reused as libraries — AeroDataBox, SerpApi, BTS history, FAA/NWS — behind a new ranking pipeline. The old brief pipeline, share pages, route day board and Buddies are removed.
- Screens that depend on a source that hasn't returned yet render their real unavailable state rather than fake numbers.
