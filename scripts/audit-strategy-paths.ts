const DATE = process.env["PLAN_STRATEGY_TEST_DATE"]!;
const ROUTES = [{ origin: "IAH", dest: "OKC" }, { origin: "OKC", dest: "ORD" }];
async function main() {
  const { rankStandbyOptions } = await import("@/lib/aircue/ranking.server");
  const out: unknown[] = [];
  for (const r of ROUTES) {
    const res: any = await rankStandbyOptions({
      origin: r.origin, dest: r.dest, travelDate: DATE, airline: "UA",
      includeNearby: false,
    } as any);
    out.push({
      route: `${r.origin}>${r.dest}`,
      strategies: (res.strategies ?? []).map((s: any) => ({
        id: s.id, path: s.path, optionCount: s.optionCount,
        bestRank: s.bestRank, connection: s.connection, hasGateway: !!s.gateway,
      })),
      optionPaths: (res.options ?? []).map((o: any) => ({
        rank: o.rank, kind: o.kind,
        path: o.segments?.length ? [o.segments[0].origin, ...o.segments.map((g: any) => g.dest)] : [o.origin, o.dest],
        airline: o.airlineCode ?? o.airline ?? null,
        flight: o.flightNumber ?? null,
      })),
    });
  }
  console.log(JSON.stringify(out, null, 2));
}
void main();
