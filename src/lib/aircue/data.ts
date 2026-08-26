/** PRD status model: Clear, Watch, Elevated, Active disruption, Incomplete. */
export type BriefStatus = "clear" | "watch" | "elevated" | "disruption" | "incomplete";

/** PRD confidence classes. */
export type Confidence = "confirmed" | "strong" | "context";

export type SignalCategory =
  | "weather"
  | "airport"
  | "faa"
  | "event"
  | "holiday"
  | "aircraft"
  | "cancellation"
  | "flight";

export type SignalLocation = "departure" | "arrival" | "chain";

export interface Signal {
  id: string;
  category: SignalCategory;
  location: SignalLocation;
  /** Short label, e.g. "Arrival weather". */
  title: string;
  /** The detected condition, one line. */
  detail: string;
  /** Why it matters for a standby attempt. */
  why: string;
  confidence: Confidence;
  level: BriefStatus;
  /** Evidence: where it came from and when it was last checked. */
  source: string;
  updated: string;
}

export interface BriefSection {
  label: string;
  place: string;
  code: string;
  status: BriefStatus;
  summary: string;
  signals: Signal[];
  /** Categories that could not be checked at the last run. */
  unavailable?: string[];
}

export interface ChangeEntry {
  id: string;
  time: string;
  text: string;
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
  /** Standby outlook headline, fixed-template copy. */
  outlook: string;
  /** Standby impact: why the strongest signals may matter. */
  impact: string;
  generatedAt: string;
  changes: ChangeEntry[];
  departure: BriefSection;
  arrival: BriefSection;
  chain: {
    summary: string;
    status: BriefStatus;
    signals: Signal[];
    unavailable?: string[];
  };
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
    outlook: "Weather and passenger-displacement pressure overlap.",
    impact:
      "Thunderstorms near ORD may reduce arrival capacity inside your flight window, and confirmed passengers from an earlier cancelled DEN–ORD flight may be reaccommodated onto later Chicago flights. Event demand adds context. Aircue cannot see the standby list.",
    generatedAt: "Last checked 8:42 AM MDT",
    changes: [
      {
        id: "c1",
        time: "8:42 AM",
        text: "Elevated: an earlier DEN–ORD flight was cancelled today.",
      },
      { id: "c2", time: "6:10 AM", text: "Watch: thunderstorms entered the ORD arrival window." },
      { id: "c3", time: "Yesterday, 7:02 PM", text: "Watch started. No material pressure detected." },
    ],
    departure: {
      label: "Departure",
      place: "Denver",
      code: "DEN",
      status: "clear",
      summary: "No material departure pressure detected at the last check.",
      signals: [
        {
          id: "dep-weather",
          category: "weather",
          location: "departure",
          title: "Departure weather",
          detail: "No adverse conditions in the DEN forecast during the departure window.",
          why: "Clear conditions at departure make ground delay programs and departure holds less likely during your window.",
          confidence: "confirmed",
          level: "clear",
          source: "Aviation weather (TAF/METAR)",
          updated: "8:35 AM",
        },
        {
          id: "dep-airport",
          category: "airport",
          location: "departure",
          title: "Airport operations",
          detail: "DEN departure delays are within normal range today.",
          why: "A stable airport means fewer displaced confirmed passengers competing for later seats.",
          confidence: "confirmed",
          level: "clear",
          source: "Airport operations feed",
          updated: "8:40 AM",
        },
        {
          id: "dep-faa",
          category: "faa",
          location: "departure",
          title: "FAA programs",
          detail: "No ground stop, ground delay program, or closure at DEN.",
          why: "FAA programs pause or meter departures, which compresses the schedule and reduces flexibility.",
          confidence: "confirmed",
          level: "clear",
          source: "FAA operations status",
          updated: "8:41 AM",
        },
      ],
    },
    arrival: {
      label: "Arrival",
      place: "Chicago",
      code: "ORD",
      status: "elevated",
      summary: "Multiple arrival conditions overlap inside the flight window.",
      signals: [
        {
          id: "arr-weather",
          category: "weather",
          location: "arrival",
          title: "Arrival weather",
          detail: "Thunderstorms expected near ORD around the scheduled arrival.",
          why: "Arrival capacity may fall during the flight window, which can produce holds, diversions, or a ground delay program upstream at DEN.",
          confidence: "confirmed",
          level: "elevated",
          source: "Aviation weather (TAF)",
          updated: "8:20 AM",
        },
        {
          id: "arr-airport",
          category: "airport",
          location: "arrival",
          title: "Airport operations",
          detail: "ORD arrival delays have deteriorated through the morning.",
          why: "Deteriorating airport performance tends to worsen later in the day, and later flights are where standby travelers end up.",
          confidence: "strong",
          level: "elevated",
          source: "Airport operations feed",
          updated: "8:38 AM",
        },
        {
          id: "arr-event",
          category: "event",
          location: "arrival",
          title: "Destination event",
          detail: "Lollapalooza begins tomorrow in Chicago.",
          why: "Inbound demand may be elevated before the event starts. This is demand context, not proof that the flight is full.",
          confidence: "context",
          level: "watch",
          source: "Event calendar",
          updated: "Yesterday, 9:00 PM",
        },
        {
          id: "arr-convention",
          category: "event",
          location: "arrival",
          title: "Destination event",
          detail: "A large downtown convention runs through Sunday.",
          why: "Additional inbound demand context for Chicago. Attendance is unverified, so scale is not claimed.",
          confidence: "context",
          level: "watch",
          source: "Event calendar",
          updated: "Yesterday, 9:00 PM",
        },
      ],
    },
    chain: {
      status: "elevated",
      summary: "Inbound aircraft is late and the route has already lost a flight today.",
      signals: [
        {
          id: "chain-inbound",
          category: "aircraft",
          location: "chain",
          title: "Inbound aircraft",
          detail: "The inbound aircraft is arriving into DEN about 34 minutes late.",
          why: "A late inbound may reach your flight as a departure delay, reducing the time available to attempt a later flight.",
          confidence: "strong",
          level: "watch",
          source: "Flight status feed",
          updated: "8:36 AM",
        },
        {
          id: "chain-status",
          category: "flight",
          location: "chain",
          title: "Selected flight",
          detail: "No delay posted for UA782.",
          why: "The airline has not filed a delay yet. This can change quickly when the inbound aircraft is late.",
          confidence: "confirmed",
          level: "clear",
          source: "Flight status feed",
          updated: "8:42 AM",
        },
        {
          id: "chain-cancel",
          category: "cancellation",
          location: "chain",
          title: "Earlier route cancellation",
          detail: "One earlier DEN–ORD flight was cancelled today.",
          why: "Confirmed passengers may be reaccommodated onto later Chicago flights, and confirmed travelers are handled before standby.",
          confidence: "confirmed",
          level: "elevated",
          source: "Flight status feed",
          updated: "8:42 AM",
        },
      ],
    },
    watch: {
      active: true,
      nextCheck: "9:15 AM",
      cadence: "Every 30 minutes on the day of travel",
      expires: "Ends automatically after arrival",
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
    outlook: "No material external pressure detected at the last check.",
    impact:
      "Nothing in weather, airport operations, FAA programs, or route cancellations currently indicates added standby pressure. Clear does not mean open seats.",
    generatedAt: "Last checked 8:31 AM EDT",
    changes: [
      { id: "d1", time: "8:31 AM", text: "Rechecked. No material change." },
      { id: "d2", time: "Yesterday, 8:30 PM", text: "Watch started. No material pressure detected." },
    ],
    departure: {
      label: "Departure",
      place: "Atlanta",
      code: "ATL",
      status: "clear",
      summary: "No material departure pressure detected.",
      signals: [
        {
          id: "d-dep-weather",
          category: "weather",
          location: "departure",
          title: "Departure weather",
          detail: "No adverse conditions forecast at ATL during the departure window.",
          why: "Stable departure weather keeps the schedule intact and limits reaccommodation.",
          confidence: "confirmed",
          level: "clear",
          source: "Aviation weather (TAF/METAR)",
          updated: "8:25 AM",
        },
        {
          id: "d-dep-faa",
          category: "faa",
          location: "departure",
          title: "FAA programs",
          detail: "No ground stop or delay program at ATL.",
          why: "No metering is currently restricting departures.",
          confidence: "confirmed",
          level: "clear",
          source: "FAA operations status",
          updated: "8:30 AM",
        },
      ],
    },
    arrival: {
      label: "Arrival",
      place: "Austin",
      code: "AUS",
      status: "clear",
      summary: "No material arrival pressure detected.",
      signals: [
        {
          id: "d-arr-weather",
          category: "weather",
          location: "arrival",
          title: "Arrival weather",
          detail: "No adverse conditions forecast at AUS during the arrival window.",
          why: "Normal arrival capacity is expected, so holds and diversions are less likely.",
          confidence: "confirmed",
          level: "clear",
          source: "Aviation weather (TAF)",
          updated: "8:25 AM",
        },
        {
          id: "d-arr-event",
          category: "event",
          location: "arrival",
          title: "Destination event",
          detail: "No major events detected in Austin on the travel date.",
          why: "No directional inbound demand context was found for this date.",
          confidence: "context",
          level: "clear",
          source: "Event calendar",
          updated: "Yesterday, 8:00 PM",
        },
      ],
    },
    chain: {
      status: "clear",
      summary: "No route disruption detected today.",
      signals: [
        {
          id: "d-chain-status",
          category: "flight",
          location: "chain",
          title: "Selected flight",
          detail: "No delay posted for DL1180.",
          why: "The airline has not filed a delay for this flight.",
          confidence: "confirmed",
          level: "clear",
          source: "Flight status feed",
          updated: "8:31 AM",
        },
        {
          id: "d-chain-cancel",
          category: "cancellation",
          location: "chain",
          title: "Earlier route cancellation",
          detail: "No ATL–AUS cancellations detected today.",
          why: "No confirmed passengers appear to be displaced onto later flights on this route.",
          confidence: "confirmed",
          level: "clear",
          source: "Flight status feed",
          updated: "8:31 AM",
        },
      ],
      unavailable: ["Inbound aircraft assignment (published closer to departure)"],
    },
    watch: {
      active: true,
      nextCheck: "8:30 PM",
      cadence: "Twice daily until 24 hours before departure",
      expires: "Ends automatically after arrival",
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
    outlook: "A required source is unavailable, so no reliable outlook can be produced.",
    impact:
      "FAA program status could not be retrieved for either airport, and the inbound aircraft assignment is unknown. Detected conditions are shown, but the overall picture is incomplete.",
    generatedAt: "Last checked 8:39 AM CDT",
    changes: [
      { id: "a1", time: "8:39 AM", text: "Incomplete: FAA operations status is unavailable." },
      { id: "a2", time: "7:05 AM", text: "Watch started. Watch-level conditions detected." },
    ],
    departure: {
      label: "Departure",
      place: "Dallas–Fort Worth",
      code: "DFW",
      status: "watch",
      summary: "One developing condition detected at DFW.",
      signals: [
        {
          id: "a-dep-weather",
          category: "weather",
          location: "departure",
          title: "Departure weather",
          detail: "Scattered afternoon thunderstorms possible near the DFW departure window.",
          why: "Convective activity may pause departures and compress the remaining schedule, which can reduce backup options later in the day.",
          confidence: "strong",
          level: "watch",
          source: "Aviation weather (TAF)",
          updated: "8:15 AM",
        },
      ],
      unavailable: ["FAA programs"],
    },
    arrival: {
      label: "Arrival",
      place: "New York",
      code: "LGA",
      status: "watch",
      summary: "Arrival operations are running behind normal.",
      signals: [
        {
          id: "a-arr-airport",
          category: "airport",
          location: "arrival",
          title: "Airport operations",
          detail: "LGA arrival delays are moderately above normal this morning.",
          why: "A congested arrival airport reduces schedule flexibility later in the day.",
          confidence: "strong",
          level: "watch",
          source: "Airport operations feed",
          updated: "8:33 AM",
        },
      ],
      unavailable: ["FAA programs"],
    },
    chain: {
      status: "incomplete",
      summary: "Flight status is available, but the aircraft chain cannot be evaluated.",
      signals: [
        {
          id: "a-chain-status",
          category: "flight",
          location: "chain",
          title: "Selected flight",
          detail: "No delay posted for AA2210.",
          why: "The airline has not filed a delay. This may change as the day develops.",
          confidence: "confirmed",
          level: "clear",
          source: "Flight status feed",
          updated: "8:39 AM",
        },
      ],
      unavailable: ["Inbound aircraft assignment"],
    },
    watch: {
      active: true,
      nextCheck: "9:10 AM",
      cadence: "Every 30 minutes on the day of travel",
      expires: "Ends automatically after arrival",
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

/** One-sentence, user-facing meaning for each status. */
export const statusMeaning: Record<BriefStatus, string> = {
  clear: "No meaningful outside pressure found at last check. Not a seat prediction.",
  watch: "Something is developing. Keep an eye on it.",
  elevated: "Outside conditions may make this attempt harder.",
  disruption: "A real operational problem is happening now.",
  incomplete: "We don’t have enough live data to judge.",
};

export const searchDisclaimer =
  "Aircue does not show seats, list position, or whether you will clear.";

export function allSignals(brief: Brief): Signal[] {
  return [
    ...(brief.departure.signals ?? []),
    ...(brief.arrival.signals ?? []),
    ...(brief.chain.signals ?? []),
  ];
}

export function getSignal(brief: Brief, signalId: string): Signal | undefined {
  return allSignals(brief).find((s) => s.id === signalId);
}

export function missingSources(brief: Brief): string[] {
  return [
    ...(brief.departure.unavailable ?? []),
    ...(brief.arrival.unavailable ?? []),
    ...(brief.chain.unavailable ?? []),
  ];
}
