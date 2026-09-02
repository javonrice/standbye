import { Suspense, lazy, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { airportPoints } from "@/lib/aircue/airports.functions";
import type { StandbyOption, StandbyPlan } from "@/lib/aircue/standby";

// three.js touches the DOM at import time — never load it during SSR.
const GlobeCanvas = lazy(() => import("@/components/aircue/GlobeCanvas"));

/** Every stop on the itinerary, in order: origin, each hub, destination. */
export function routeStops(plan: StandbyPlan, option: StandbyOption | null): string[] {
  const codes: string[] = [];
  if (option && option.segments.length > 0) {
    for (const seg of option.segments) {
      if (seg.origin) codes.push(seg.origin.toUpperCase());
      if (seg.dest) codes.push(seg.dest.toUpperCase());
    }
  } else {
    codes.push(plan.origin.toUpperCase(), plan.dest.toUpperCase());
  }
  return codes.filter((c, i) => c && c !== codes[i - 1]);
}

/**
 * The globe behind the Home sheet. Renders nothing but the night sky until
 * coordinates arrive, so the sheet never waits on it.
 */
export function RouteGlobe({ stops }: { stops: string[] }) {
  const load = useServerFn(airportPoints);
  const codes = useMemo(() => stops.map((s) => s.toUpperCase()), [stops]);

  const { data } = useQuery({
    queryKey: ["airport-points", codes.join("-")],
    queryFn: () => load({ data: { codes } }),
    enabled: codes.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });

  return (
    <div className="absolute inset-0 bg-[#050b1a]">
      {data && data.length > 0 && (
        <Suspense fallback={null}>
          <GlobeCanvas points={data} />
        </Suspense>
      )}
    </div>
  );
}
