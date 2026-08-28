/**
 * Airport grouping for searches.
 *
 * `city` groups are airports a traveller genuinely treats as the same destination
 * (Tokyo = HND + NRT). `nearby` groups are a wider net the traveller opts into.
 */

const CITY_GROUPS: string[][] = [
  ["HND", "NRT"],
  ["JFK", "LGA", "EWR"],
  ["LHR", "LGW", "LCY", "STN"],
  ["CDG", "ORY"],
  ["ORD", "MDW"],
  ["LAX", "BUR", "LGB", "SNA"],
  ["SFO", "OAK", "SJC"],
  ["DCA", "IAD", "BWI"],
  ["IAH", "HOU"],
  ["DFW", "DAL"],
  ["MIA", "FLL"],
  ["ICN", "GMP"],
  ["PEK", "PKX"],
  ["MIL", "MXP", "LIN", "BGY"],
  ["SEA", "BFI"],
];

/** Driveable alternatives — only used when the traveller asks for nearby airports. */
const NEARBY_GROUPS: string[][] = [
  ["DAY", "CVG", "CMH", "IND"],
  ["ORD", "MDW", "MKE", "RFD"],
  ["BOS", "PVD", "MHT"],
  ["PHL", "EWR", "ABE"],
  ["SAN", "SNA", "LGB"],
  ["AUS", "SAT"],
  ["RDU", "GSO", "CLT"],
  ["MSP", "RST"],
  ["DEN", "COS"],
  ["PDX", "SEA"],
  ["TPA", "PIE", "SRQ"],
  ["MCO", "SFB", "TPA"],
  ["BNA", "BWG"],
  ["SLC", "PVU"],
];

function lookup(groups: string[][], code: string): string[] {
  const iata = code.toUpperCase();
  const group = groups.find((g) => g.includes(iata));
  return group ? group.filter((c) => c !== iata) : [];
}

/**
 * The airports a search should actually cover, primary first.
 * Capped so one search never fans out into an unbounded number of API calls.
 */
export function expandAirports(code: string, nearby: boolean, limit = 3): string[] {
  const iata = code.toUpperCase();
  const out = [iata, ...lookup(CITY_GROUPS, iata)];
  if (nearby) {
    for (const alt of lookup(NEARBY_GROUPS, iata)) if (!out.includes(alt)) out.push(alt);
  }
  return out.slice(0, limit);
}

/** True when the two codes are effectively the same place. */
export function sameCity(a: string, b: string): boolean {
  if (a.toUpperCase() === b.toUpperCase()) return true;
  return lookup(CITY_GROUPS, a).includes(b.toUpperCase());
}
