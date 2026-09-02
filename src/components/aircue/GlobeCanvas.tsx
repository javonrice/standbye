import { useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";

import type { AirportPoint } from "@/lib/aircue/airports.functions";

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

/**
 * Interactive globe with the flight path drawn leg by leg, so a connection
 * reads as origin → hub → destination rather than a single straight hop.
 * Browser-only: mounted through React.lazy from RouteGlobe.
 */
export default function GlobeCanvas({ points }: { points: AirportPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const arcs = useMemo<Arc[]>(() => {
    const out: Arc[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!;
      const b = points[i + 1]!;
      out.push({ startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon });
    }
    return out;
  }, [points]);

  // Frame the whole route, then let the traveler spin and drag it themselves.
  useEffect(() => {
    const g = globe.current;
    if (!g || !ready || points.length === 0) return;
    const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const lng = points.reduce((s, p) => s + p.lon, 0) / points.length;
    const span = Math.max(
      ...points.map((p) =>
        Math.max(Math.abs(p.lat - lat), Math.abs(p.lon - lng)),
      ),
      8,
    );
    // Tilt the framing north a touch so the arc sits above the sheet edge.
    g.pointOfView(
      { lat: lat + 8, lng, altitude: Math.min(2.8, Math.max(1.5, 1.0 + span / 20)) },
      1200,
    );
    const controls = g.controls();
    // No auto-spin: the route should stay framed until the traveler drags it.
    controls.autoRotate = false;
    controls.enableZoom = true;
  }, [points, ready]);

  return (
    <div ref={wrap} className="h-full w-full">
      {size.w > 0 && (
        <Globe
          ref={globe}
          width={size.w}
          height={size.h}
          onGlobeReady={() => setReady(true)}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="https://unpkg.com/three-globe@2.44.0/example/img/earth-night.jpg"
          atmosphereColor="#7db4ff"
          atmosphereAltitude={0.18}
          arcsData={arcs}
          arcColor={() => ["#8fd0ff", "#ffffff"]}
          arcStroke={0.55}
          arcAltitudeAutoScale={0.4}
          arcDashLength={0.45}
          arcDashGap={0.12}
          arcDashAnimateTime={2600}
          pointsData={points}
          pointLat={(p: object) => (p as AirportPoint).lat}
          pointLng={(p: object) => (p as AirportPoint).lon}
          pointColor={() => "#ffffff"}
          pointAltitude={0.012}
          pointRadius={0.32}
          labelsData={points}
          labelLat={(p: object) => (p as AirportPoint).lat}
          labelLng={(p: object) => (p as AirportPoint).lon}
          labelText={(p: object) => (p as AirportPoint).iata}
          labelSize={1.1}
          labelDotRadius={0}
          labelColor={() => "rgba(255,255,255,0.85)"}
          labelResolution={2}
        />
      )}
    </div>
  );
}
