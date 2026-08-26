export type CueTone = "harder" | "mixed" | "helpful";

export type CueKey = "route" | "reliability" | "backup" | "weather" | "demand";

export interface Cue {
  key: CueKey;
  /** Display name of the cue, e.g. "Reliability". */
  label: string;
  /** How this cue leans for a standby traveler. */
  tone: CueTone;
  /** Short word shown on the right, e.g. "Favorable", "Watch". */
  toneLabel: string;
  /** 0-100 strength of the cue, drives the meter bar. */
  score: number;
  /** One plain sentence shown when the row is expanded. */
  summary: string;
  /** Short evidence lines behind the cue. */
  evidence: string[];
}

export interface CueBrief {
  /** Small pill above the headline, e.g. "Mixed setup". */
  setupLabel: string;
  setupTone: CueTone;
  /** The plain-language headline. */
  headline: string;
  /** One or two supporting sentences. */
  subline: string;
  cues: Cue[];
}

export const cueBriefs: Record<string, CueBrief> = {
  "ua782-2026-08-01": {
    setupLabel: "Mixed setup",
    setupTone: "mixed",
    headline: "Good options, but bring a backup plan.",
    subline:
      "Frequent service gives you options, but recent reliability and demand could make this trip harder.",
    cues: [
      {
        key: "route",
        label: "Route",
        tone: "helpful",
        toneLabel: "Favorable",
        score: 84,
        summary: "Denver to Chicago runs often, so a missed seat is not the end of the day.",
        evidence: [
          "11 flights on this route today",
          "Next departure about 90 minutes after yours",
          "Two airlines fly the route nonstop",
        ],
      },
      {
        key: "reliability",
        label: "Reliability",
        tone: "mixed",
        toneLabel: "Mixed",
        score: 52,
        summary: "The route has been shaky today, which pushes paying passengers onto later flights.",
        evidence: [
          "One earlier Denver to Chicago flight cancelled",
          "Arrival delays into Chicago climbing all morning",
          "Your aircraft is arriving about 34 minutes late",
        ],
      },
      {
        key: "backup",
        label: "Backup",
        tone: "helpful",
        toneLabel: "Strong",
        score: 76,
        summary: "If you do not clear, there are still later flights you could try tonight.",
        evidence: [
          "Three more nonstops after your flight",
          "Last departure leaves at 8:55 PM",
          "One-stop options through Houston if needed",
        ],
      },
      {
        key: "weather",
        label: "Weather",
        tone: "mixed",
        toneLabel: "Watch",
        score: 44,
        summary: "Storms in Chicago around landing time can slow arrivals and back up the evening.",
        evidence: [
          "Thunderstorms forecast in Chicago this evening",
          "Denver looks clear at departure",
          "Storms can cut how many planes land per hour",
        ],
      },
      {
        key: "demand",
        label: "Demand",
        tone: "harder",
        toneLabel: "Elevated",
        score: 28,
        summary: "More people than usual are heading into Chicago this weekend.",
        evidence: [
          "Lollapalooza starts tomorrow",
          "Large convention downtown through Sunday",
          "Weekend travel peak on a Saturday afternoon",
        ],
      },
    ],
  },

  "dl1180-2026-08-04": {
    setupLabel: "Helpful setup",
    setupTone: "helpful",
    headline: "Nothing unusual is working against this trip.",
    subline: "Calm weather, on-time airports, and plenty of later flights if you need one.",
    cues: [
      {
        key: "route",
        label: "Route",
        tone: "helpful",
        toneLabel: "Favorable",
        score: 88,
        summary: "Atlanta to Austin runs all day long.",
        evidence: ["9 flights on this route", "Departures roughly every two hours"],
      },
      {
        key: "reliability",
        label: "Reliability",
        tone: "helpful",
        toneLabel: "Strong",
        score: 82,
        summary: "The route is having a normal day with nothing cancelled.",
        evidence: ["No cancellations today", "Both airports running on time"],
      },
      {
        key: "backup",
        label: "Backup",
        tone: "helpful",
        toneLabel: "Strong",
        score: 80,
        summary: "Several later flights if this one does not work out.",
        evidence: ["Four more departures after yours", "Last flight leaves at 9:20 PM"],
      },
      {
        key: "weather",
        label: "Weather",
        tone: "helpful",
        toneLabel: "Clear",
        score: 86,
        summary: "Good weather on both ends of the trip.",
        evidence: ["Nothing in the Atlanta forecast", "Austin clear at arrival"],
      },
      {
        key: "demand",
        label: "Demand",
        tone: "mixed",
        toneLabel: "Normal",
        score: 60,
        summary: "A regular midweek travel day into Austin.",
        evidence: ["No large events in town", "Tuesday mornings usually run lighter"],
      },
    ],
  },

  "aa2210-2026-08-01": {
    setupLabel: "Incomplete picture",
    setupTone: "mixed",
    headline: "We are missing part of the picture on this one.",
    subline:
      "What we can see looks manageable, but we could not check air traffic conditions, so treat this lightly.",
    cues: [
      {
        key: "route",
        label: "Route",
        tone: "helpful",
        toneLabel: "Favorable",
        score: 78,
        summary: "Dallas to New York is a heavy route with frequent departures.",
        evidence: ["8 flights today", "Departures about every 90 minutes"],
      },
      {
        key: "reliability",
        label: "Reliability",
        tone: "mixed",
        toneLabel: "Unclear",
        score: 50,
        summary: "We could not tell which plane is flying this route today.",
        evidence: ["No delay posted for AA2210", "Aircraft assignment unavailable"],
      },
      {
        key: "backup",
        label: "Backup",
        tone: "mixed",
        toneLabel: "Fair",
        score: 58,
        summary: "There are later flights, but evening options thin out fast.",
        evidence: ["Two nonstops after yours", "Last departure at 7:40 PM"],
      },
      {
        key: "weather",
        label: "Weather",
        tone: "mixed",
        toneLabel: "Watch",
        score: 46,
        summary: "Scattered afternoon storms could pop up around Dallas.",
        evidence: ["Storms possible near departure time", "New York running slightly behind"],
      },
      {
        key: "demand",
        label: "Demand",
        tone: "mixed",
        toneLabel: "Normal",
        score: 62,
        summary: "Nothing unusual pulling extra people into New York.",
        evidence: ["No major events flagged", "Typical Saturday traffic"],
      },
    ],
  },
};

export function getCueBrief(briefId: string): CueBrief | undefined {
  return cueBriefs[briefId];
}
