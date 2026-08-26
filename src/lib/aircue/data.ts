export type Confidence = "confirmed" | "strong" | "context";

export type BriefStatus = "clear" | "watch" | "elevated" | "disruption" | "incomplete";

export type SignalCategory =
  | "weather"
  | "airport"
  | "faa"
  | "event"
  | "holiday"
  | "aircraft"
  | "cancellation"
  | "flight";

export interface Signal {
  id: string;
  category: SignalCategory;
  title: string;
  detail: string;
  why: string;
  confidence: Confidence;
  timing: string;
  source: string;
  retrieved: string;
}

export interface BriefSection {
  label: string;
  place: string;
  code: string;
  status: BriefStatus;
  signals: Signal[];
  unavailable: string[];
}

export interface ChangeEntry {
  id: string;
  time: string;
  text: string;
}

export interface SourceStatus {
  name: string;
  category: string;
  state: "fresh" | "stale" | "unavailable";
  updated: string;
}

export interface Brief {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  originCity: string;
  destinationCity: string;
  date: string;
  departsLocal: string;
  arrivesLocal: string;
  countdown: string;
  status: BriefStatus;
  statusSentence: string;
  generatedAt: string;
  changes: ChangeEntry[];
  departure: BriefSection;
  arrival: BriefSection;
  chain: {
    signals: Signal[];
    unavailable: string[];
  };
  impact: string[];
  sources: SourceStatus[];
  watch?: {
    active: boolean;
    nextCheck: string;
    cadence: string;
    expires: string;
    email: string;
  };
  shareToken?: string;
}

export const briefs: Brief[] = [
  {
    id: "ua782-2026-08-01",
    flightNumber: "UA782",
    origin: "DEN",
    destination: "ORD",
    originCity: "Denver",
    destinationCity: "Chicago",
    date: "Sat, Aug 1, 2026",
    departsLocal: "3:15 PM MDT",
    arrivesLocal: "6:42 PM CDT",
    countdown: "Departs in 6h 33m",
    status: "elevated",
    statusSentence:
      "Arrival weather and passenger-displacement pressure overlap, so the standby plan may be more fragile than the schedule suggests.",
    generatedAt: "8:42 AM CDT",
    changes: [
      {
        id: "c1",
        time: "8:42 AM CDT",
        text: "Outlook moved from Watch to Elevated after an earlier DEN–ORD cancellation was detected.",
      },
      {
        id: "c2",
        time: "6:10 AM CDT",
        text: "Thunderstorms entered the ORD arrival window in the latest terminal forecast.",
      },
      {
        id: "c3",
        time: "Yesterday, 7:02 PM CDT",
        text: "Watch started. No material pressure detected at the first check.",
      },
    ],
    departure: {
      label: "Departure",
      place: "Denver",
      code: "DEN",
      status: "clear",
      signals: [
        {
          id: "dep-weather",
          category: "weather",
          title: "Weather",
          detail: "No meaningful conditions detected in the departure window",
          why: "Nothing in the terminal forecast overlaps the scheduled push time.",
          confidence: "context",
          timing: "Window 2:15 PM – 4:15 PM MDT",
          source: "Aviation Weather Center · TAF",
          retrieved: "Updated 8:20 AM MDT",
        },
        {
          id: "dep-airport",
          category: "airport",
          title: "Airport operations",
          detail: "Operating normally",
          why: "Departure delay trend is within normal range for this time of day.",
          confidence: "context",
          timing: "Checked for the full departure day",
          source: "FlightAware",
          retrieved: "Updated 8:38 AM MDT",
        },
        {
          id: "dep-faa",
          category: "faa",
          title: "FAA programs",
          detail: "No ground stop, delay program, or closure detected",
          why: "No national airspace restriction currently applies to DEN.",
          confidence: "context",
          timing: "Active now",
          source: "FAA NAS Status",
          retrieved: "Updated 8:40 AM MDT",
        },
        {
          id: "dep-event",
          category: "event",
          title: "Outbound event pressure",
          detail: "No large event ending near the departure window",
          why: "Outbound demand context applies only when an event ends before departure.",
          confidence: "context",
          timing: "Aug 1 outbound direction",
          source: "Ticketmaster · internal calendar",
          retrieved: "Updated today",
        },
      ],
      unavailable: [],
    },
    arrival: {
      label: "Arrival",
      place: "Chicago",
      code: "ORD",
      status: "elevated",
      signals: [
        {
          id: "arr-weather",
          category: "weather",
          title: "Arrival weather",
          detail: "Thunderstorms expected near ORD around arrival",
          why: "Arrival capacity may fall during the flight window, which could delay or hold the flight.",
          confidence: "confirmed",
          timing: "Overlaps 5:45 PM – 8:00 PM CDT",
          source: "National Weather Service · Aviation Weather Center",
          retrieved: "Updated 8:20 AM CDT",
        },
        {
          id: "arr-airport",
          category: "airport",
          title: "Airport operations",
          detail: "Arrival delays trending upward this afternoon",
          why: "A worsening arrival trend may reduce schedule flexibility on later Chicago flights.",
          confidence: "strong",
          timing: "Trend observed since 6:00 AM CDT",
          source: "FlightAware",
          retrieved: "Updated 8:35 AM CDT",
        },
        {
          id: "arr-faa",
          category: "faa",
          title: "FAA programs",
          detail: "No active program detected at ORD",
          why: "A ground delay program may be issued later if storms develop as forecast.",
          confidence: "context",
          timing: "Active now",
          source: "FAA NAS Status",
          retrieved: "Updated 8:40 AM CDT",
        },
        {
          id: "arr-event",
          category: "event",
          title: "Inbound event context",
          detail: "Lollapalooza begins tomorrow in Chicago",
          why: "Inbound demand may be elevated before the event begins. This is demand context, not proof that a flight is full.",
          confidence: "context",
          timing: "Event starts Aug 2 · inbound direction",
          source: "Ticketmaster Discovery",
          retrieved: "Updated today",
        },
        {
          id: "arr-convention",
          category: "event",
          title: "Convention context",
          detail: "A major convention is running downtown",
          why: "Attendance is unverified, so Aircue shows event presence only.",
          confidence: "context",
          timing: "Runs Jul 30 – Aug 2 · inbound direction",
          source: "Internal calendar",
          retrieved: "Updated today",
        },
      ],
      unavailable: [],
    },
    chain: {
      signals: [
        {
          id: "chain-inbound",
          category: "aircraft",
          title: "Inbound aircraft",
          detail: "Inbound aircraft arriving DEN 34 minutes late from SFO",
          why: "A late inbound aircraft may delay this departure, which could reduce your later options.",
          confidence: "strong",
          timing: "Inbound arrives 2:29 PM MDT",
          source: "FlightAware",
          retrieved: "Updated 8:38 AM MDT",
        },
        {
          id: "chain-status",
          category: "flight",
          title: "Selected flight status",
          detail: "Scheduled · no delay published",
          why: "No airline-published delay has been applied to UA782 yet.",
          confidence: "confirmed",
          timing: "Scheduled 3:15 PM MDT",
          source: "FlightAware",
          retrieved: "Updated 8:38 AM MDT",
        },
        {
          id: "chain-cancel",
          category: "cancellation",
          title: "Earlier route cancellations",
          detail: "One earlier DEN–ORD flight was cancelled today",
          why: "Confirmed passengers may be moved onto later Chicago flights, which could reduce standby flexibility.",
          confidence: "strong",
          timing: "Cancelled 7:05 AM MDT departure",
          source: "FlightAware",
          retrieved: "Updated 8:38 AM MDT",
        },
      ],
      unavailable: [],
    },
    impact: [
      "Arrival weather and a worsening ORD arrival trend overlap the flight window, so this flight could be delayed or held.",
      "An earlier same-route cancellation means confirmed passengers may already be moving onto later Chicago flights.",
      "A late inbound aircraft may push the departure, which could shorten the gap to your backup options.",
      "Event context suggests inbound demand to Chicago may be elevated, but it does not indicate how full any flight is.",
    ],
    sources: [
      { name: "FlightAware", category: "Flight status and route activity", state: "fresh", updated: "8:38 AM CDT" },
      { name: "FAA NAS Status", category: "Programs and closures", state: "fresh", updated: "8:40 AM CDT" },
      { name: "Aviation Weather Center", category: "METAR and TAF", state: "fresh", updated: "8:20 AM CDT" },
      { name: "National Weather Service", category: "Watches and warnings", state: "fresh", updated: "8:20 AM CDT" },
      { name: "Ticketmaster Discovery", category: "Events", state: "fresh", updated: "7:00 AM CDT" },
      { name: "Internal calendar", category: "Holidays and curated events", state: "fresh", updated: "Today" },
    ],
    watch: {
      active: true,
      nextCheck: "9:15 AM CDT",
      cadence: "Every 30–60 minutes inside 24 hours of departure",
      expires: "Stops automatically Aug 1, 8:42 PM CDT",
      email: "jordan@example.com",
    },
    shareToken: "b7f2c1",
  },
  {
    id: "dl1180-2026-08-04",
    flightNumber: "DL1180",
    origin: "ATL",
    destination: "AUS",
    originCity: "Atlanta",
    destinationCity: "Austin",
    date: "Tue, Aug 4, 2026",
    departsLocal: "11:05 AM EDT",
    arrivesLocal: "12:34 PM CDT",
    countdown: "Departs in 3 days",
    status: "clear",
    statusSentence:
      "No meaningful external pressure was detected at the last check. This is not a seat prediction.",
    generatedAt: "8:31 AM CDT",
    changes: [
      { id: "d1", time: "8:31 AM CDT", text: "No material change since the previous check." },
      { id: "d2", time: "Yesterday, 8:30 PM CDT", text: "Watch started. Outlook opened at Clear." },
    ],
    departure: {
      label: "Departure",
      place: "Atlanta",
      code: "ATL",
      status: "clear",
      signals: [
        {
          id: "d-dep-weather",
          category: "weather",
          title: "Weather",
          detail: "No meaningful conditions detected in the departure window",
          why: "Forecast conditions do not overlap the scheduled departure window.",
          confidence: "context",
          timing: "Window 10:05 AM – 12:05 PM EDT",
          source: "National Weather Service",
          retrieved: "Updated 7:50 AM EDT",
        },
        {
          id: "d-dep-faa",
          category: "faa",
          title: "FAA programs",
          detail: "No program detected",
          why: "No airspace restriction currently applies to ATL.",
          confidence: "context",
          timing: "Active now",
          source: "FAA NAS Status",
          retrieved: "Updated 8:30 AM EDT",
        },
      ],
      unavailable: [],
    },
    arrival: {
      label: "Arrival",
      place: "Austin",
      code: "AUS",
      status: "clear",
      signals: [
        {
          id: "d-arr-weather",
          category: "weather",
          title: "Weather",
          detail: "No meaningful conditions detected in the arrival window",
          why: "Nothing in the forecast overlaps the arrival window at this range.",
          confidence: "context",
          timing: "Window 11:34 AM – 1:34 PM CDT",
          source: "National Weather Service",
          retrieved: "Updated 7:50 AM CDT",
        },
        {
          id: "d-arr-event",
          category: "event",
          title: "Inbound event context",
          detail: "No large inbound event detected for this date",
          why: "Event context appears only when timing and direction match your trip.",
          confidence: "context",
          timing: "Aug 4 · inbound direction",
          source: "Ticketmaster · internal calendar",
          retrieved: "Updated today",
        },
      ],
      unavailable: [],
    },
    chain: {
      signals: [
        {
          id: "d-chain-status",
          category: "flight",
          title: "Selected flight status",
          detail: "Scheduled",
          why: "No published delay or cancellation on this flight.",
          confidence: "confirmed",
          timing: "Scheduled 11:05 AM EDT",
          source: "FlightAware",
          retrieved: "Updated 8:29 AM EDT",
        },
        {
          id: "d-chain-cancel",
          category: "cancellation",
          title: "Earlier route cancellations",
          detail: "None detected on ATL–AUS today",
          why: "No displacement pressure from earlier same-route cancellations.",
          confidence: "confirmed",
          timing: "Checked for the travel day",
          source: "FlightAware",
          retrieved: "Updated 8:29 AM EDT",
        },
      ],
      unavailable: ["Inbound aircraft is not assigned this far ahead of departure."],
    },
    impact: [
      "Nothing material was detected around departure, arrival, or the flight chain at the last check.",
      "Conditions can change quickly. Watching the flight keeps you updated only when something meaningful changes.",
    ],
    sources: [
      { name: "FlightAware", category: "Flight status and route activity", state: "fresh", updated: "8:29 AM CDT" },
      { name: "FAA NAS Status", category: "Programs and closures", state: "fresh", updated: "8:30 AM CDT" },
      { name: "National Weather Service", category: "Forecast and warnings", state: "fresh", updated: "7:50 AM CDT" },
      { name: "Ticketmaster Discovery", category: "Events", state: "fresh", updated: "7:00 AM CDT" },
    ],
    watch: {
      active: true,
      nextCheck: "8:30 PM CDT",
      cadence: "Every 12 hours between 3 and 7 days out",
      expires: "Stops automatically Aug 4, 2:34 PM CDT",
      email: "jordan@example.com",
    },
  },
  {
    id: "aa2210-2026-08-01",
    flightNumber: "AA2210",
    origin: "DFW",
    destination: "LGA",
    originCity: "Dallas–Fort Worth",
    destinationCity: "New York",
    date: "Sat, Aug 1, 2026",
    departsLocal: "1:40 PM CDT",
    arrivesLocal: "5:58 PM EDT",
    countdown: "Departs in 4h 58m",
    status: "incomplete",
    statusSentence:
      "A required source is unavailable, so Aircue cannot produce a reliable outlook for this flight yet.",
    generatedAt: "8:39 AM CDT",
    changes: [
      { id: "a1", time: "8:39 AM CDT", text: "Outlook moved to Incomplete after the FAA source stopped responding." },
      { id: "a2", time: "7:05 AM CDT", text: "Watch started. Outlook opened at Watch." },
    ],
    departure: {
      label: "Departure",
      place: "Dallas–Fort Worth",
      code: "DFW",
      status: "watch",
      signals: [
        {
          id: "a-dep-weather",
          category: "weather",
          title: "Weather",
          detail: "Scattered afternoon storms possible near DFW",
          why: "Storms near the departure window could slow the departure bank.",
          confidence: "strong",
          timing: "Overlaps 12:40 PM – 2:40 PM CDT",
          source: "Aviation Weather Center · TAF",
          retrieved: "Updated 8:15 AM CDT",
        },
      ],
      unavailable: ["FAA programs unavailable. This category could not be checked."],
    },
    arrival: {
      label: "Arrival",
      place: "New York",
      code: "LGA",
      status: "watch",
      signals: [
        {
          id: "a-arr-airport",
          category: "airport",
          title: "Airport operations",
          detail: "Arrival delays slightly above normal",
          why: "A busier arrival environment may reduce flexibility on later New York flights.",
          confidence: "context",
          timing: "Trend observed this morning",
          source: "FlightAware",
          retrieved: "Updated 8:36 AM EDT",
        },
      ],
      unavailable: ["FAA programs unavailable. This category could not be checked."],
    },
    chain: {
      signals: [
        {
          id: "a-chain-status",
          category: "flight",
          title: "Selected flight status",
          detail: "Scheduled · no delay published",
          why: "No airline-published delay has been applied yet.",
          confidence: "confirmed",
          timing: "Scheduled 1:40 PM CDT",
          source: "FlightAware",
          retrieved: "Updated 8:36 AM CDT",
        },
      ],
      unavailable: ["Inbound aircraft could not be resolved for this flight."],
    },
    impact: [
      "Aircue could not check FAA programs at the last refresh, so missing data is shown instead of a Clear result.",
      "Storms near the DFW departure window may still matter. Recheck closer to departure.",
    ],
    sources: [
      { name: "FlightAware", category: "Flight status and route activity", state: "fresh", updated: "8:36 AM CDT" },
      { name: "FAA NAS Status", category: "Programs and closures", state: "unavailable", updated: "Last success 6:12 AM CDT" },
      { name: "Aviation Weather Center", category: "METAR and TAF", state: "fresh", updated: "8:15 AM CDT" },
      { name: "National Weather Service", category: "Watches and warnings", state: "stale", updated: "Last update 5:40 AM CDT" },
      { name: "Ticketmaster Discovery", category: "Events", state: "fresh", updated: "7:00 AM CDT" },
    ],
    watch: {
      active: true,
      nextCheck: "9:10 AM CDT",
      cadence: "Every 30–60 minutes inside 24 hours of departure",
      expires: "Stops automatically Aug 1, 7:58 PM EDT",
      email: "jordan@example.com",
    },
  },
];

export function getBrief(id: string): Brief | undefined {
  return briefs.find((b) => b.id === id);
}

export const defaultBrief = briefs[0]!;

export const disclaimer =
  "Aircue does not include airline load data, standby priority, or a prediction that you will receive a seat.";
