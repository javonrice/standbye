# AirCue — standby decision engine (full rebuild in this draft)

AirCue stops being a flight-status app. The product becomes: plan a standby attempt, compare the options, pick one, watch it, and get told when the situation — not just the flight — changes.

Every screen answers one of four questions: Which standby should I try? Is it worth trying? What are my backups? Has anything changed?

## What ships in this pass

- Sign-in with accounts, so profile, reported loads and watches follow the user across devices.
- Onboarding: welcome, standby profile (home airline, traveler type, airlines you can use).
- Plan tab: where to, date, travelers; plus "check flight number" with leg picker.
- Standby options: ranked setups labeled Favorable / Mixed / Riskier, each with Availability, Operations, History, Recovery at a glance.
- Option detail (the Cue): the judgment, the reasons, confidence, add-a-load, watch.
- Detail sheets: public availability (with the honest "what this does not mean"), historical context, airport/weather, holiday context, recovery room, compare.
- Add reported load, updated cue after load, stale-load reminder, no-load and no-availability states.
- Watch setup, Watching home, meaningful-change screen, what-changed timeline, notification copy.
- You tab: profile, travel access, notifications, saved airports, how AirCue works, data sources, privacy.
- Empty, loading, unavailable-data, no-good-options and cancelled/plan-changed states throughout.

Data is live: AeroDataBox for flights and operations, SerpApi for public booking availability, BTS for history, FAA/NWS for operations, holiday context. Availability probes run on each ranked option as you asked — I'll note where quota gets expensive and keep a visible "checked N min ago" freshness stamp everywhere.

Language rules enforced across the UI: no boarding probability, no 0–100 chance, never "open seats" for public availability, missing data is never rendered as bad data, and a user-entered load always outranks inferred signals.
