/**
 * Phase 2 live smoke — board intersection across route shapes.
 *
 * Usage:
 *   AERODATABOX_RAPIDAPI_KEY=... bun scripts/test-phase2-route-shapes.ts
 *
 * Optional env:
 *   PLAN_STRATEGY_TEST_DATE=2026-08-31
 *   SUPABASE_SERVICE_ROLE_KEY=...  (enables full rankStandbyOptions per shape)
 */
const TRAVEL_DATE = process.env["PLAN_STRATEGY_TEST_DATE"] ?? "2026-08-31";
const CARRIER = "UA";

const ROUTE_SHAPES: Array<{
  label: string;
  origin: string;
  dest: string;
  nearby: boolean;
}> = [
  { label: "hub → hub", origin: "IAH", dest: "ORD", nearby: false },
  { label: "hub → smaller station", origin: "IAH", dest: "OKC", nearby: false },
  { label: "small station → hub", origin: "OKC", dest: "ORD", nearby: false },
  { label: "small station → small station", origin: "OKC", dest: "CVG", nearby: false },
  { label: "nearby airports enabled", origin: "IAH", dest: "ORD", nearby: true },
];

interface ShapeResult {
  label: string;
  origin: string;
  dest: string;
  nearby: boolean;
  discovery: { status: string; checkedAt: string | null };
  directLegs: number;
  connectionStrategies: number;
  strategyIds: string[];
  rankStandby?: {
    options: number;
    strategies: number;
    discoveryStatus: string;
    ms: number;
    error?: string;
  };
  ms: number;
  error?: string;
}

async function testShape(shape: (typeof ROUTE_SHAPES)[number]): Promise<ShapeResult> {
  const start = Date.now();
  try {
    const { expandAirports } = await import("@/lib/aircue/airport-groups");
    const { fetchNetworkSnapshot, routeLegsFromSnapshot } = await import(
      "@/lib/aircue/network-snapshot.server"
    );
    const { discoverConnectionGatewaysFromSnapshot } = await import(
      "@/lib/aircue/strategy-discovery.server"
    );
    const { buildStrategyCatalog } = await import("@/lib/aircue/plan-strategy");

    const origins = expandAirports(shape.origin, shape.nearby);
    const dests = expandAirports(shape.dest, shape.nearby);

    const snapshot = await fetchNetworkSnapshot({
      origins,
      dests,
      travelDate: TRAVEL_DATE,
      airline: CARRIER,
    });

    const directLegs = routeLegsFromSnapshot(snapshot, shape.origin, shape.dest).length;
    const builds = await discoverConnectionGatewaysFromSnapshot({
      snapshot,
      origins,
      dests,
      primaryOrigin: shape.origin,
      primaryDest: shape.dest,
      allowed: new Set([CARRIER]),
      wide: false,
    });
    const gateways = builds.builds.map((b) => ({
      hub: b.hub,
      city: b.city,
      state: b.state,
      label: b.label,
      summary: b.summary,
      inboundShots: [],
      onwardDepartures: [],
      onwardCount: b.onward.length,
      recoveryState: b.recoveryState,
      recoveryLabel: b.recoveryLabel,
      caveat: b.caveat,
      addedMinutes: b.addedMinutes,
    }));
    const strategies = buildStrategyCatalog({
      rankedOptions: [],
      gatewayBuilds: builds.builds,
      gateways,
    });

    const result: ShapeResult = {
      label: shape.label,
      origin: shape.origin,
      dest: shape.dest,
      nearby: shape.nearby,
      discovery: snapshot.discovery,
      directLegs,
      connectionStrategies: strategies.length,
      strategyIds: strategies.map((s) => s.id).slice(0, 12),
      ms: Date.now() - start,
    };

    if (process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
      process.env["AERODATABOX_RAPIDAPI_KEY"] =
        process.env["AERODATABOX_RAPIDAPI_KEY"] ?? process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"];
      process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"] =
        process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"] ?? process.env["AERODATABOX_RAPIDAPI_KEY"];
      process.env["AERODATABOX_ENABLED"] = "true";
      process.env["GOOGLE_FLIGHTS8_ENABLED"] = "true";
      const rankStart = Date.now();
      try {
        const { rankStandbyOptions } = await import("@/lib/aircue/ranking.server");
        const ranked = await rankStandbyOptions({
          origin: shape.origin,
          dest: shape.dest,
          travelDate: TRAVEL_DATE,
          carriers: [CARRIER],
          travelers: 1,
          cabin: "any",
          userId: "phase2-route-shapes",
          maxStops: 1,
          nearby: shape.nearby,
          routingMode: "best",
        });
        result.rankStandby = {
          options: ranked.options.length,
          strategies: ranked.strategies.length,
          discoveryStatus: ranked.strategyDiscovery.status,
          ms: Date.now() - rankStart,
        };
      } catch (err) {
        result.rankStandby = {
          options: 0,
          strategies: 0,
          discoveryStatus: "unavailable",
          ms: Date.now() - rankStart,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return result;
  } catch (err) {
    return {
      label: shape.label,
      origin: shape.origin,
      dest: shape.dest,
      nearby: shape.nearby,
      discovery: { status: "unavailable", checkedAt: null },
      directLegs: 0,
      connectionStrategies: 0,
      strategyIds: [],
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  if (!process.env["AERODATABOX_RAPIDAPI_KEY"] && !process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"]) {
    console.error("Set AERODATABOX_RAPIDAPI_KEY or GOOGLE_FLIGHTS8_RAPIDAPI_KEY");
    process.exit(1);
  }

  const results: ShapeResult[] = [];
  for (const shape of ROUTE_SHAPES) {
    results.push(await testShape(shape));
  }

  const summary = {
    timestamp: new Date().toISOString(),
    travelDate: TRAVEL_DATE,
    carrier: CARRIER,
    shapes: results,
    assertions: {
      allDiscoveryRan: results.every((r) => !r.error),
      hubToHubHasConnections: (results.find((r) => r.label === "hub → hub")?.connectionStrategies ?? 0) > 1,
      discoveryStatusPresent: results.every((r) => r.discovery.status !== undefined),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.assertions.allDiscoveryRan) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
