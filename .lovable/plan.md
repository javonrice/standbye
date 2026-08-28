# Apply the standby engine database migration

The accepted draft left one database migration staged but not yet applied. Nothing else changes in this step.

## What the migration adds

- **profiles** — display name per account
- **standby_profiles** — home airline, traveler type, airline access, home airports, notification mode
- **plans** — origin, destination, travel date, travelers, cabin, preferences
- **plan_options** — ranked standby options with flight details, headline, reasons, segments, recovery, evidence
- **reported_loads** — user-reported open seats and standby counts per flight and date
- **watch_plans** — a watch on one option, with verdict, snapshot and check schedule
- **plan_change_events** — meaningful change history for each watch

## Access rules

Every table is private to the signed-in person who owns the row. Only they can view, create, edit or delete their own profile, plans, options, reported loads, watches and change events.

## Technical notes

- Source file: `.lovable/drafts/var_01m12w9qrzfpab37n8n8xqmd8a/migrations/20260828010000_aircue_standby_engine.sql`, applied byte-for-byte.
- Each table gets grants for `authenticated` and `service_role`, RLS enabled, and an owner-scoped policy; no `anon` access.
- Indexes on plans by user/date, options by plan/rank, loads by flight/date, watches by user/state, change events by watch/time.
- Once applied, the staged migration file is removed and the generated database types refresh.

Switch to build mode to apply it.
