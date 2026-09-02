import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface AirportOption {
  iata: string;
  name: string;
  city: string | null;
  state: string | null;
}

/** Typeahead over the airports reference table. Public: reference data only. */
export const searchAirports = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string }) => z.object({ q: z.string() }).parse(input))
  .handler(async ({ data }): Promise<AirportOption[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim().toUpperCase().replace(/[^A-Z]/g, "");
    if (!q) return [];

    // Three parallel lookups so a 3-letter IATA code returns a short, exact list
    // instead of every city/name containing the same substring (e.g. ORD matching Hartford).
    const exact = supabaseAdmin
      .from("airports")
      .select("iata,name,city,state")
      .ilike("iata", q)
      .limit(6);

    const prefix =
      q.length < 3
        ? supabaseAdmin
            .from("airports")
            .select("iata,name,city,state")
            .ilike("iata", `${q}%`)
            .limit(6)
        : Promise.resolve({ data: [] });

    const text = supabaseAdmin
      .from("airports")
      .select("iata,name,city,state")
      .or(`city.ilike.%${q}%,name.ilike.%${q}%`)
      .limit(6);

    const [exactRes, prefixRes, textRes] = await Promise.all([exact, prefix, text]);

    const seen = new Set<string>();
    const dedupe = (rows: unknown[] | null) =>
      ((rows ?? []) as AirportOption[]).filter((a) => {
        if (seen.has(a.iata)) return false;
        seen.add(a.iata);
        return true;
      });

    const exactRows = dedupe(exactRes.data);

    // For a 3-letter code that exactly matches an IATA code, return only exact matches
    // so the dropdown stays short and relevant.
    if (q.length === 3 && exactRows.length > 0) {
      return exactRows.slice(0, 6);
    }

    return [...exactRows, ...dedupe(prefixRes.data), ...dedupe(textRes.data)].slice(0, 6);
  });

export interface AirportPoint {
  iata: string;
  lat: number;
  lon: number;
  city: string | null;
}

/**
 * Coordinates for a handful of IATA codes, used to draw the route on the
 * Home globe. Reference data only.
 */
export const airportPoints = createServerFn({ method: "GET" })
  .inputValidator((input: { codes: string[] }) =>
    z.object({ codes: z.array(z.string()).max(12) }).parse(input),
  )
  .handler(async ({ data }): Promise<AirportPoint[]> => {
    const { airportGeo } = await import("@/lib/aircue/airport-lookup.server");
    const wanted = data.codes.map((c) => c.toUpperCase()).filter(Boolean);
    const geo = await airportGeo(wanted);
    return wanted
      .map((code) => {
        const hit = geo.get(code);
        return hit ? { iata: code, lat: hit.lat, lon: hit.lon, city: hit.city } : null;
      })
      .filter((p): p is AirportPoint => p !== null);
  });
