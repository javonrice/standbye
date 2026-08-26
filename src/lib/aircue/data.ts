export type BriefStatus = "fine" | "watch" | "rough" | "unknown";

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
  /** Short plain-language label shown on the pill, e.g. "Storms at arrival". */
  title: string;
  /** One-line everyday explanation shown under the pill. */
  detail: string;
  /** Expanded paragraph: what this means for someone flying standby. */
  why: string;
  level: BriefStatus;
}

export interface BriefSection {
  label: string;
  place: string;
  code: string;
  status: BriefStatus;
  /** One plain sentence summing up this airport. */
  summary: string;
  signals: Signal[];
  /** Soft note when something could not be checked. */
  note?: string;
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
  /** The headline verdict, in everyday words. */
  verdict: string;
  /** Up to three short reasons, written the way a person would say them. */
  reasons: string[];
  generatedAt: string;
  changes: ChangeEntry[];
  departure: BriefSection;
  arrival: BriefSection;
  chain: {
    summary: string;
    signals: Signal[];
    note?: string;
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
    countdown: "Leaves in 6h 33m",
    status: "rough",
    verdict: "Getting on this flight looks harder than usual.",
    reasons: [
      "Storms over Chicago around the time you would land",
      "An earlier Denver to Chicago flight was cancelled today",
      "Two big events have Chicago busy this weekend",
    ],
    generatedAt: "8:42 AM",
    changes: [
      {
        id: "c1",
        time: "8:42 AM",
        text: "Things got tougher: an earlier Denver to Chicago flight was cancelled.",
      },
      { id: "c2", time: "6:10 AM", text: "Storms showed up in the Chicago forecast for this evening." },
      { id: "c3", time: "Yesterday, 7:02 PM", text: "We started watching. Nothing looked unusual then." },
    ],
    departure: {
      label: "Leaving",
      place: "Denver",
      code: "DEN",
      status: "fine",
      summary: "Denver looks normal today.",
      signals: [
        {
          id: "dep-weather",
          category: "weather",
          title: "Weather looks fine",
          detail: "Nothing rough in the forecast around your departure time.",
          why: "Clear weather at your departure airport means flights are less likely to bunch up or sit on the ground, so the boarding process should run on time.",
          level: "fine",
        },
        {
          id: "dep-airport",
          category: "airport",
          title: "Airport running normally",
          detail: "Flights are leaving Denver about on time.",
          why: "When an airport is running on time, there are fewer stranded passengers competing for later seats, which usually helps standby.",
          level: "fine",
        },
        {
          id: "dep-faa",
          category: "faa",
          title: "No air traffic holds",
          detail: "No ground stops or delay programs in Denver right now.",
          why: "Air traffic holds pause departures and back everything up. There are none here at the moment.",
          level: "fine",
        },
      ],
    },
    arrival: {
      label: "Arriving",
      place: "Chicago",
      code: "ORD",
      status: "rough",
      summary: "Chicago is the problem today, not Denver.",
      signals: [
        {
          id: "arr-weather",
          category: "weather",
          title: "Storms at arrival",
          detail: "Thunderstorms are expected in Chicago right around when you would land.",
          why: "Storms slow down how many planes can land per hour. Your flight could be delayed, circle, or get held on the ground in Denver. Delays like this also push other passengers onto later flights, which crowds standby lists.",
          level: "rough",
        },
        {
          id: "arr-airport",
          category: "airport",
          title: "Delays building",
          detail: "Arrival delays in Chicago have been climbing all morning.",
          why: "A slow airport gets slower as the day goes on. Later flights are the ones most likely to be delayed or cancelled, which is exactly where standby travelers end up.",
          level: "rough",
        },
        {
          id: "arr-event",
          category: "event",
          title: "Lollapalooza starts tomorrow",
          detail: "A lot of people are heading into Chicago this weekend.",
          why: "A big event usually means more people flying in. It does not prove your flight is full, but flights into town are more likely to be booked up than on a normal Saturday.",
          level: "watch",
        },
        {
          id: "arr-convention",
          category: "event",
          title: "Convention downtown",
          detail: "A large convention is running in the city through Sunday.",
          why: "Another reason there is extra demand into Chicago right now. Again, this is context about the city, not a look at your flight's seat count.",
          level: "watch",
        },
      ],
    },
    chain: {
      summary: "Your plane is running late and the route already lost a flight today.",
      signals: [
        {
          id: "chain-inbound",
          category: "aircraft",
          title: "Your plane is running late",
          detail: "The aircraft flying this route is arriving in Denver about 34 minutes behind.",
          why: "The plane has to land before it can leave again. A late arrival often means a late departure, which eats into the time you would have to try a backup flight.",
          level: "watch",
        },
        {
          id: "chain-status",
          category: "flight",
          title: "Still on schedule",
          detail: "The airline has not posted a delay for UA782 yet.",
          why: "Officially the flight is still on time. That can change quickly when the inbound plane is late.",
          level: "fine",
        },
        {
          id: "chain-cancel",
          category: "cancellation",
          title: "Earlier flight cancelled",
          detail: "One earlier Denver to Chicago flight was cancelled today.",
          why: "Everyone booked on that flight has to get rebooked, and the airline puts them on later flights to Chicago. Those paying passengers get seats before standby does.",
          level: "rough",
        },
      ],
    },
    watch: {
      active: true,
      nextCheck: "9:15 AM",
      cadence: "About every half hour on the day you fly",
      expires: "Stops on its own after your flight",
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
    countdown: "Leaves in 3 days",
    status: "fine",
    verdict: "Nothing unusual is working against this flight.",
    reasons: [
      "Good weather on both ends",
      "Both airports are running on time",
      "No cancellations on this route today",
    ],
    generatedAt: "8:31 AM",
    changes: [
      { id: "d1", time: "8:31 AM", text: "Checked again. Nothing has changed." },
      { id: "d2", time: "Yesterday, 8:30 PM", text: "We started watching. Everything looked calm." },
    ],
    departure: {
      label: "Leaving",
      place: "Atlanta",
      code: "ATL",
      status: "fine",
      summary: "Atlanta looks calm for your departure.",
      signals: [
        {
          id: "d-dep-weather",
          category: "weather",
          title: "Weather looks fine",
          detail: "Nothing in the forecast around your departure time.",
          why: "Good weather at departure keeps the schedule moving, so fewer passengers get bumped around.",
          level: "fine",
        },
        {
          id: "d-dep-faa",
          category: "faa",
          title: "No air traffic holds",
          detail: "No ground stops or delay programs in Atlanta.",
          why: "Nothing is currently slowing departures out of Atlanta.",
          level: "fine",
        },
      ],
    },
    arrival: {
      label: "Arriving",
      place: "Austin",
      code: "AUS",
      status: "fine",
      summary: "Austin looks calm too.",
      signals: [
        {
          id: "d-arr-weather",
          category: "weather",
          title: "Weather looks fine",
          detail: "Nothing rough expected in Austin when you would land.",
          why: "Calm arrival weather means the airport can take its normal number of landings, so delays are less likely.",
          level: "fine",
        },
        {
          id: "d-arr-event",
          category: "event",
          title: "Quiet week in town",
          detail: "No big events pulling extra people into Austin that day.",
          why: "Fewer people flying in usually means a little more room, though it is never a guarantee of an open seat.",
          level: "fine",
        },
      ],
    },
    chain: {
      summary: "The route is having a normal day.",
      signals: [
        {
          id: "d-chain-status",
          category: "flight",
          title: "On schedule",
          detail: "No delay posted for DL1180.",
          why: "The airline has not flagged anything on this flight.",
          level: "fine",
        },
        {
          id: "d-chain-cancel",
          category: "cancellation",
          title: "No cancellations today",
          detail: "Nothing has been cancelled on Atlanta to Austin.",
          why: "No extra passengers are being pushed onto later flights, so the standby list should look normal.",
          level: "fine",
        },
      ],
      note: "We cannot tell which plane will fly this route yet. That usually shows up the day before.",
    },
    watch: {
      active: true,
      nextCheck: "8:30 PM",
      cadence: "Twice a day until you get closer to the trip",
      expires: "Stops on its own after your flight",
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
    countdown: "Leaves in 4h 58m",
    status: "unknown",
    verdict: "We cannot give you a straight answer on this one yet.",
    reasons: [
      "We could not check air traffic holds right now",
      "Storms are possible in Dallas near your departure",
      "New York arrivals are a little slower than normal",
    ],
    generatedAt: "8:39 AM",
    changes: [
      { id: "a1", time: "8:39 AM", text: "We lost access to air traffic information, so we stopped guessing." },
      { id: "a2", time: "7:05 AM", text: "We started watching this flight." },
    ],
    departure: {
      label: "Leaving",
      place: "Dallas–Fort Worth",
      code: "DFW",
      status: "watch",
      summary: "Dallas could get bumpy this afternoon.",
      signals: [
        {
          id: "a-dep-weather",
          category: "weather",
          title: "Storms possible",
          detail: "Scattered afternoon storms could pop up near your departure time.",
          why: "Afternoon storms in Dallas can pause departures for a while. Even a short pause backs up the rest of the day and pushes passengers onto later flights.",
          level: "watch",
        },
      ],
      note: "We could not check air traffic holds for Dallas right now.",
    },
    arrival: {
      label: "Arriving",
      place: "New York",
      code: "LGA",
      status: "watch",
      summary: "New York is a bit slower than normal.",
      signals: [
        {
          id: "a-arr-airport",
          category: "airport",
          title: "Slightly slow arrivals",
          detail: "Flights into New York are running a little behind this morning.",
          why: "A busy arrival airport leaves less wiggle room later in the day, which can matter if you need a backup flight.",
          level: "watch",
        },
      ],
      note: "We could not check air traffic holds for New York right now.",
    },
    chain: {
      summary: "The flight is on schedule, but we are missing part of the picture.",
      signals: [
        {
          id: "a-chain-status",
          category: "flight",
          title: "On schedule",
          detail: "No delay posted for AA2210 yet.",
          why: "The airline has not flagged this flight, though that can change.",
          level: "fine",
        },
      ],
      note: "We could not tell which plane is flying this route today.",
    },
    watch: {
      active: true,
      nextCheck: "9:10 AM",
      cadence: "About every half hour on the day you fly",
      expires: "Stops on its own after your flight",
      email: "jordan@example.com",
    },
  },
];

export function getBrief(id: string): Brief | undefined {
  return briefs.find((b) => b.id === id);
}

export const defaultBrief = briefs[0]!;

export const disclaimer =
  "Aircue cannot see how many seats are open or where you sit on the standby list. We show what is happening around your flight so you can decide for yourself.";
