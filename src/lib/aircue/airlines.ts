/** Marketing airlines covered by the U.S. DOT on-time record (client-safe). */

export interface Airline {
  code: string;
  name: string;
}

/** "ALL" pools every reporting airline on the route. */
export const ALL_AIRLINES = "ALL";

export const AIRLINES: Airline[] = [
  { code: ALL_AIRLINES, name: "All airlines" },
  { code: "AA", name: "American" },
  { code: "AS", name: "Alaska" },
  { code: "B6", name: "JetBlue" },
  { code: "DL", name: "Delta" },
  { code: "F9", name: "Frontier" },
  { code: "G4", name: "Allegiant" },
  { code: "HA", name: "Hawaiian" },
  { code: "MQ", name: "Envoy" },
  { code: "NK", name: "Spirit" },
  { code: "OO", name: "SkyWest" },
  { code: "SY", name: "Sun Country" },
  { code: "UA", name: "United" },
  { code: "VX", name: "Virgin America" },
  { code: "WN", name: "Southwest" },
  { code: "YX", name: "Republic" },
];

const BY_CODE = new Map(AIRLINES.map((a) => [a.code, a]));

export function airlineName(code: string | null | undefined): string {
  if (!code || code === ALL_AIRLINES) return "All airlines";
  return BY_CODE.get(code)?.name ?? code;
}

export function isKnownAirline(code: string): boolean {
  return BY_CODE.has(code);
}
