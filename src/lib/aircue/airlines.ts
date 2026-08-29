/** Airline reference data (client-safe). */

export interface Airline {
  code: string;
  name: string;
}

/** "ALL" pools every reporting airline on the route. */
export const ALL_AIRLINES = "ALL";

/**
 * Global carrier directory keyed by IATA code. Every code here resolves to an
 * icon mark on the shared logo service, so any carrier a provider returns can
 * be shown with its real name and logo instead of a bare two-letter code.
 */
export const AIRLINE_DIRECTORY: Record<string, string> = {
  // United States
  AA: "American",
  AS: "Alaska",
  AX: "Trans States",
  B6: "JetBlue",
  C5: "CommuteAir",
  DL: "Delta",
  EM: "Empire",
  F9: "Frontier",
  G4: "Allegiant",
  HA: "Hawaiian",
  KS: "PenAir",
  MQ: "Envoy",
  NK: "Spirit",
  OH: "PSA",
  OO: "SkyWest",
  PT: "Piedmont",
  QX: "Horizon",
  SY: "Sun Country",
  UA: "United",
  US: "US Airways",
  VX: "Virgin America",
  WN: "Southwest",
  YV: "Mesa",
  YX: "Republic",
  ZW: "Air Wisconsin",
  "9E": "Endeavor",
  "9K": "Cape Air",
  "4B": "Boutique Air",

  // Canada
  AC: "Air Canada",
  F8: "Flair",
  PD: "Porter",
  TS: "Air Transat",
  WS: "WestJet",
  Y9: "Lynx Air",

  // Mexico, Central & South America
  AD: "Azul",
  AM: "Aeroméxico",
  AR: "Aerolíneas Argentinas",
  AV: "Avianca",
  CM: "Copa",
  G3: "GOL",
  H2: "SKY Airline",
  JA: "JetSMART",
  JJ: "LATAM Brasil",
  LA: "LATAM",
  VB: "Viva",
  VH: "Aeropostal",
  Y4: "Volaris",
  "2Z": "Voepass",
  "4O": "Interjet",

  // Europe
  A3: "Aegean",
  A5: "HOP!",
  AF: "Air France",
  AY: "Finnair",
  AZ: "ITA Airways",
  BA: "British Airways",
  BT: "airBaltic",
  D8: "Norwegian Air Sweden",
  DE: "Condor",
  DY: "Norwegian",
  EI: "Aer Lingus",
  EN: "Air Dolomiti",
  EW: "Eurowings",
  FI: "Icelandair",
  FR: "Ryanair",
  HV: "Transavia Netherlands",
  IB: "Iberia",
  JP: "Adria Airways",
  JU: "Air Serbia",
  KL: "KLM",
  LG: "Luxair",
  LH: "Lufthansa",
  LO: "LOT Polish",
  LX: "SWISS",
  OA: "Olympic Air",
  OK: "Czech Airlines",
  OS: "Austrian",
  OU: "Croatia Airlines",
  PC: "Pegasus",
  RO: "TAROM",
  S7: "S7 Airlines",
  SK: "SAS",
  SN: "Brussels Airlines",
  SU: "Aeroflot",
  TO: "Transavia France",
  TP: "TAP Air Portugal",
  TK: "Turkish Airlines",
  U2: "easyJet",
  U6: "Ural Airlines",
  UX: "Air Europa",
  VS: "Virgin Atlantic",
  VY: "Vueling",
  W4: "Wizz Air Malta",
  W6: "Wizz Air",
  WF: "Widerøe",
  X3: "TUI fly",
  YM: "Montenegro Airlines",
  ZB: "Air Albania",

  // Middle East & Africa
  AH: "Air Algérie",
  AT: "Royal Air Maroc",
  ET: "Ethiopian",
  EK: "Emirates",
  EY: "Etihad",
  GF: "Gulf Air",
  HC: "Air Senegal",
  KQ: "Kenya Airways",
  ME: "Middle East Airlines",
  MK: "Air Mauritius",
  MS: "EgyptAir",
  QR: "Qatar Airways",
  RJ: "Royal Jordanian",
  RW: "RwandAir",
  SA: "South African Airways",
  SV: "Saudia",
  TU: "Tunisair",
  WB: "RwandAir Express",
  WY: "Oman Air",

  // East Asia
  "3U": "Sichuan Airlines",
  "7C": "Jeju Air",
  "7G": "StarFlyer",
  "9C": "Spring Airlines",
  AE: "Mandarin Airlines",
  BC: "Skymark",
  BR: "EVA Air",
  BX: "Air Busan",
  CA: "Air China",
  CI: "China Airlines",
  CX: "Cathay Pacific",
  CZ: "China Southern",
  FM: "Shanghai Airlines",
  GK: "Jetstar Japan",
  GS: "Tianjin Airlines",
  HU: "Hainan Airlines",
  HX: "Hong Kong Airlines",
  IT: "Tigerair Taiwan",
  JL: "Japan Airlines",
  JW: "Vanilla Air",
  JX: "STARLUX",
  KA: "Cathay Dragon",
  KE: "Korean Air",
  KN: "China United",
  LJ: "Jin Air",
  MF: "Xiamen Air",
  MM: "Peach",
  MU: "China Eastern",
  NH: "ANA",
  OZ: "Asiana",
  RS: "Air Seoul",
  SC: "Shandong Airlines",
  TW: "T'way Air",
  UO: "HK Express",
  ZE: "Eastar Jet",
  ZH: "Shenzhen Airlines",

  // South & Southeast Asia
  "2T": "TruJet",
  "5J": "Cebu Pacific",
  "6E": "IndiGo",
  "9W": "Jet Airways",
  AI: "Air India",
  AK: "AirAsia",
  BG: "Biman Bangladesh",
  BL: "Pacific Airlines",
  BS: "US-Bangla",
  DD: "Nok Air",
  DG: "Cebgo",
  FD: "Thai AirAsia",
  G8: "Go First",
  GA: "Garuda Indonesia",
  ID: "Batik Air",
  IU: "Super Air Jet",
  IX: "Air India Express",
  JT: "Lion Air",
  MH: "Malaysia Airlines",
  MI: "SilkAir",
  OD: "Batik Air Malaysia",
  PG: "Bangkok Airways",
  PR: "Philippine Airlines",
  QG: "Citilink",
  QH: "Bamboo Airways",
  QP: "Akasa Air",
  QZ: "Indonesia AirAsia",
  SG: "SpiceJet",
  SJ: "Sriwijaya Air",
  SL: "Thai Lion Air",
  SQ: "Singapore Airlines",
  TG: "Thai Airways",
  TR: "Scoot",
  UK: "Vistara",
  UL: "SriLankan",
  VJ: "VietJet Air",
  VN: "Vietnam Airlines",
  WE: "Thai Smile",
  Z2: "Philippines AirAsia",
  D7: "AirAsia X",

  // Oceania
  FJ: "Fiji Airways",
  IE: "Solomon Airlines",
  JQ: "Jetstar",
  NZ: "Air New Zealand",
  PX: "Air Niugini",
  QF: "Qantas",
  SB: "Aircalin",
  VA: "Virgin Australia",
  ZL: "Rex",
};

/** Every carrier we can name, sorted for pickers. */
export const ALL_AIRLINE_OPTIONS: Airline[] = Object.entries(AIRLINE_DIRECTORY)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** U.S. DOT reporting carriers — used where a short domestic list is expected. */
export const AIRLINES: Airline[] = [
  { code: ALL_AIRLINES, name: "All airlines" },
  ...["AA", "AS", "B6", "DL", "F9", "G4", "HA", "MQ", "NK", "OO", "SY", "UA", "VX", "WN", "YX"].map(
    (code) => ({ code, name: AIRLINE_DIRECTORY[code] ?? code }),
  ),
];

export function airlineName(code: string | null | undefined): string {
  if (!code || code === ALL_AIRLINES) return "All airlines";
  return AIRLINE_DIRECTORY[code.toUpperCase()] ?? code;
}

export function isKnownAirline(code: string): boolean {
  return code.toUpperCase() in AIRLINE_DIRECTORY;
}
