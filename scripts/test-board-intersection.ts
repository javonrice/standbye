/**
 * Prove board-intersection discovery: IAH departures ∩ ORD arrivals.
 * Usage: AERODATABOX_RAPIDAPI_KEY=*** bun scripts/test-board-intersection.ts
 */
const KEY = process.env["AERODATABOX_RAPIDAPI_KEY"] ?? process.env["RAPIDAPI_KEY"];
const DATE = process.env["PLAN_STRATEGY_TEST_DATE"] ?? "2026-08-31";
const ORIGIN = "IAH";
const DEST = "ORD";
const CARRIER = process.env["PLAN_STRATEGY_TEST_CARRIER"] ?? "UA";
const HOST = "aerodatabox.p.rapidapi.com";

if (!KEY) throw new Error("Set AERODATABOX_RAPIDAPI_KEY");

const hdr = { "X-RapidAPI-Key": KEY, "X-RapidAPI-Host": HOST };
const MIN_LAYOVER = 60;
const MAX_LAYOVER = 360;

async function board(iata: string, direction: "Departure" | "Arrival", from: string, to: string) {
  const path = `/flights/airports/iata/${iata}/${DATE}T${from}/${DATE}T${to}?direction=${direction}&withLeg=true&withCancelled=false&withCodeshared=true&withCargo=false&withPrivate=false`;
  const res = await fetch(`https://${HOST}${path}`, { headers: hdr });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return board(iata, direction, from, to);
  }
  if (!res.ok) throw new Error(`${direction} ${iata} ${res.status}`);
  const body = (await res.json()) as { departures?: unknown[]; arrivals?: unknown[] };
  return direction === "Departure" ? (body.departures ?? []) : (body.arrivals ?? []);
}

type Leg = { carrier?: string; dep: string; arr: string; fn?: string };

function parseDepartureRow(f: unknown, boardOrigin: string): { dest: string; leg: Leg } | null {
  const row = f as {
    airline?: { iata?: string };
    departure?: { scheduledTime?: { utc?: string } };
    arrival?: { airport?: { iata?: string }; scheduledTime?: { utc?: string } };
  };
  const dep = row.departure?.scheduledTime?.utc;
  const arr = row.arrival?.scheduledTime?.utc;
  const dest = row.arrival?.airport?.iata;
  if (!dep || !arr || !dest) return null;
  return {
    dest: dest.toUpperCase(),
    leg: { carrier: row.airline?.iata?.toUpperCase(), dep, arr, fn: (f as { number?: string }).number },
  };
}

function parseArrivalRow(f: unknown): { origin: string; leg: Leg } | null {
  const row = f as {
    airline?: { iata?: string };
    departure?: { airport?: { iata?: string }; scheduledTime?: { utc?: string } };
    arrival?: { scheduledTime?: { utc?: string } };
  };
  const dep = row.departure?.scheduledTime?.utc;
  const arr = row.arrival?.scheduledTime?.utc;
  const origin = row.departure?.airport?.iata;
  if (!dep || !arr || !origin) return null;
  return {
    origin: origin.toUpperCase(),
    leg: { carrier: row.airline?.iata?.toUpperCase(), dep, arr, fn: (f as { number?: string }).number },
  };
}

const toMs = (u: string) => new Date(u.replace(" ", "T").replace("Z", "") + "Z").getTime();

const iahFlights = [
  ...(await board(ORIGIN, "Departure", "00:00", "11:59")),
  ...(await board(ORIGIN, "Departure", "12:00", "23:59")),
];
await new Promise((r) => setTimeout(r, 1200));
const ordFlights = [
  ...(await board(DEST, "Arrival", "00:00", "11:59")),
  ...(await board(DEST, "Arrival", "12:00", "23:59")),
];

const inboundByX = new Map<string, Leg[]>();
for (const f of iahFlights) {
  const parsed = parseDepartureRow(f, ORIGIN);
  if (!parsed || parsed.dest === DEST || parsed.dest === ORIGIN) continue;
  if (CARRIER && parsed.leg.carrier && parsed.leg.carrier !== CARRIER) continue;
  const list = inboundByX.get(parsed.dest) ?? [];
  list.push(parsed.leg);
  inboundByX.set(parsed.dest, list);
}

const onwardByX = new Map<string, Leg[]>();
for (const f of ordFlights) {
  const parsed = parseArrivalRow(f);
  if (!parsed || parsed.origin === DEST) continue;
  if (CARRIER && parsed.leg.carrier && parsed.leg.carrier !== CARRIER) continue;
  const list = onwardByX.get(parsed.origin) ?? [];
  list.push(parsed.leg);
  onwardByX.set(parsed.origin, list);
}

const intersection = [...inboundByX.keys()].filter((x) => onwardByX.has(x)).sort();
const viable: Array<{ x: string; pairs: number; pairsLoose: number }> = [];

for (const x of intersection) {
  const inbound = inboundByX.get(x) ?? [];
  const onward = onwardByX.get(x) ?? [];
  let pairs = 0;
  let pairsLoose = 0;
  for (const a of inbound) {
    for (const b of onward) {
      const gap = (toMs(b.dep) - toMs(a.arr)) / 60000;
      if (gap >= MIN_LAYOVER && gap <= MAX_LAYOVER) pairs++;
      if (gap >= MIN_LAYOVER) pairsLoose++;
    }
  }
  if (pairs > 0 || pairsLoose > 0) viable.push({ x, pairs, pairsLoose });
}

viable.sort((a, b) => b.pairs - a.pairs || b.pairsLoose - a.pairsLoose);

console.log(
  JSON.stringify(
    {
      config: { origin: ORIGIN, dest: DEST, date: DATE, carrier: CARRIER },
      apiCalls: 4,
      iahDestinations: inboundByX.size,
      ordOrigins: onwardByX.size,
      intersectionCount: intersection.length,
      okcInIntersection: intersection.includes("OKC"),
      okc: viable.find((v) => v.x === "OKC") ?? null,
      viableStations: viable.length,
      topViable: viable.slice(0, 15),
      currentMaxDiscoverWouldMiss: viable.filter((v) => {
        const rank = [...inboundByX.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .findIndex(([hub]) => hub === v.x);
        return rank >= 8;
      }).length,
    },
    null,
    2,
  ),
);
