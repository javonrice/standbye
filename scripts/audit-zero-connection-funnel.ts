/**
 * Zero-connection funnel audit — read-only.
 *
 * Re-implements the exact filter order of discoverConnectionGatewaysFromSnapshot()
 * against the same NetworkSnapshot, counting survivors at each stage so we can see
 * where connection candidates disappear. Changes no production filtering.
 *
 * Usage:
 *   bun scripts/audit-zero-connection-funnel.ts
 */
const TRAVEL_DATE = process.env["PLAN_STRATEGY_TEST_DATE"] ?? new Date().toISOString().slice(0, 10);
const CARRIER = "UA";

const ROUTES: Array<{ origin: string; dest: string }> = [
  { origin: "IAH", dest: "OKC" },
  { origin: "OKC", dest: "ORD" },
];

interface DetourRow {
  hub: string;
  ratio: number | null;
  limit: number;
  inboundLegs: number;
}
interface TimingRow {
  hub: string;
  inboundLegs: number;
  onwardLegs: number;
  bestGapMin: number | null;
  reason: string;
}

async function auditRoute(route: { origin: string; dest: string }) {
  const { sameCity } = await import("@/lib/aircue/airport-groups");
  const { airportGeo, milesBetween } = await import("@/lib/aircue/airport-lookup.server");
  const { fetchNetworkSnapshot, routeLegsFromSnapshot } = await import(
    "@/lib/aircue/network-snapshot.server"
  );
  const { MIN_CONNECTION_LAYOVER_MIN, MAX_CONNECTION_LAYOVER_MIN } = await import(
    "@/lib/aircue/strategy-discovery.server"
  );

  const MAX_DETOUR_BEST = 1.45;
  const origin = route.origin.toUpperCase();
  const dest = route.dest.toUpperCase();

  const snapshot = await fetchNetworkSnapshot({
    origins: [origin],
    dests: [dest],
    travelDate: TRAVEL_DATE,
    airline: CARRIER,
  });

  const originLegs = snapshot.originDepartures.get(origin) ?? [];
  const destLegs = snapshot.destArrivals.get(dest) ?? [];
  const directLegs = routeLegsFromSnapshot(snapshot, origin, dest);

  const originDests = new Set(originLegs.map((l) => l.dest.toUpperCase()));
  const destOrigins = new Set(destLegs.map((l) => l.origin.toUpperCase()));
  const rawIntersection = [...originDests].filter((x) => destOrigins.has(x)).sort();

  // Stage: carrier/access filter (snapshot already carrier-filtered to CARRIER)
  const afterCarrier = rawIntersection;

  // Stage: same-city / destination filter
  const destSet = new Set([dest]);
  const afterSameCity = afterCarrier.filter(
    (hub) =>
      !destSet.has(hub) &&
      !sameCity(hub, origin) &&
      !sameCity(hub, dest),
  );

  // Stage: detour filter
  const geo = await airportGeo([origin, dest, ...afterCarrier]);
  const from = geo.get(origin);
  const to = geo.get(dest);
  const directMiles = from && to ? milesBetween(from, to) : null;
  const ratioOf = (hub: string): number | null => {
    const h = geo.get(hub);
    if (!h || !from || !to || !directMiles || directMiles < 50) return null;
    return (milesBetween(from, h) + milesBetween(h, to)) / directMiles;
  };

  const detourRows: DetourRow[] = afterSameCity
    .map((hub) => ({
      hub,
      ratio: ratioOf(hub),
      limit: MAX_DETOUR_BEST,
      inboundLegs: originLegs.filter((l) => l.dest.toUpperCase() === hub).length,
    }))
    .sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99));

  const afterDetour = detourRows.filter((r) => r.ratio === null || r.ratio <= r.limit);

  // Stage: timing pairing
  const timingRows: TimingRow[] = [];
  let paired = 0;
  for (const row of afterDetour) {
    const inbound = originLegs.filter((l) => l.dest.toUpperCase() === row.hub);
    const onward = destLegs
      .filter((l) => l.origin.toUpperCase() === row.hub)
      .sort((a, b) => a.schedDepUtc.localeCompare(b.schedDepUtc));

    let bestGap: number | null = null;
    let ok = false;
    for (const first of inbound) {
      const arr = new Date(first.schedArrUtc).getTime();
      for (const second of onward) {
        const gap = (new Date(second.schedDepUtc).getTime() - arr) / 60000;
        if (gap < 0) continue;
        if (bestGap === null || gap < bestGap) bestGap = Math.round(gap);
        if (gap >= MIN_CONNECTION_LAYOVER_MIN && gap <= MAX_CONNECTION_LAYOVER_MIN) ok = true;
      }
    }
    if (ok) paired += 1;
    else {
      timingRows.push({
        hub: row.hub,
        inboundLegs: inbound.length,
        onwardLegs: onward.length,
        bestGapMin: bestGap,
        reason:
          onward.length === 0
            ? "no onward legs on this carrier"
            : bestGap === null
              ? "no onward departure after any inbound arrival"
              : bestGap < MIN_CONNECTION_LAYOVER_MIN
                ? `tightest gap ${bestGap}m < ${MIN_CONNECTION_LAYOVER_MIN}m min`
                : `tightest gap ${bestGap}m > ${MAX_CONNECTION_LAYOVER_MIN}m max`,
      });
    }
  }

  return {
    route: `${origin} → ${dest}`,
    travelDate: TRAVEL_DATE,
    carrier: CARRIER,
    discovery: snapshot.discovery,
    directLegs: directLegs.length,
    funnel: {
      originDepartureDestinations: originDests.size,
      destinationArrivalOrigins: destOrigins.size,
      rawIntersectionStations: rawIntersection.length,
      afterCarrierAccessFilter: afterCarrier.length,
      afterSameCityDestFilter: afterSameCity.length,
      afterDetourFilter: afterDetour.length,
      afterTimingPairing: paired,
      finalViableConnectionStrategies: paired,
    },
    rawIntersection,
    detourTable: detourRows.map((r) => ({
      path: `${origin} → ${r.hub} → ${dest}`,
      ratio: r.ratio === null ? null : Number(r.ratio.toFixed(2)),
      limit: r.limit,
      inboundLegs: r.inboundLegs,
      verdict: r.ratio === null ? "no geo — kept" : r.ratio <= r.limit ? "kept" : "rejected",
    })),
    timingFailures: timingRows,
  };
}

async function main() {
  const out = [];
  for (const route of ROUTES) {
    out.push(await auditRoute(route));
  }
  console.log(JSON.stringify(out, null, 2));
}

void main();
