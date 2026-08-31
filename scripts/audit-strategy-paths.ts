/**
 * Strategy catalog audit — read-only.
 * Prints the actual paths in plan.strategies for the zero-connection routes,
 * so we can see exactly how the catalog was assembled.
 */
const DATE = process.env["PLAN_STRATEGY_TEST_DATE"] ?? new Date().toISOString().slice(0, 10);
const ROUTES = [
  { origin: "IAH", dest: "OKC" },
  { origin: "OKC", dest: "ORD" },
];

async function main() {
  process.env["AERODATABOX_ENABLED"] = "true";
  process.env["GOOGLE_FLIGHTS8_ENABLED"] = "true";
  process.env["GOOGLE_FLIGHTS8_RAPIDAPI_KEY"] ??= process.env["AERODATABOX_RAPIDAPI_KEY"] ?? "";

  const { rankStandbyOptions } = await import("@/lib/aircue/ranking.server");
  const out: unknown[] = [];

  for (const r of ROUTES) {
    const res = await rankStandbyOptions({
      origin: r.origin,
      dest: r.dest,
      travelDate: DATE,
      carriers: ["UA"],
      travelers: 1,
      cabin: "any",
      userId: "strategy-path-audit",
      maxStops: 1,
      nearby: false,
      routingMode: "best",
    });

    out.push({
      route: `${r.origin}>${r.dest}`,
      discovery: res.strategyDiscovery,
      strategyCount: res.strategies.length,
      strategies: res.strategies.map((s) => ({
        id: s.id,
        path: s.path,
        optionCount: s.optionCount,
        bestRank: s.bestRank,
        connection: s.connection,
        hasLegacyGateway: s.gateway !== null,
        source: s.connection === null ? "option-derived" : "board-intersection",
      })),
      optionPaths: res.options.map((o) => ({
        rank: o.rank,
        kind: o.kind,
        path:
          o.segments.length > 0
            ? [o.segments[0]!.origin, ...o.segments.map((g) => g.dest)]
            : [o.origin, o.dest],
      })),
    });
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
