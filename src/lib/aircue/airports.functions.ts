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
    const q = data.q.trim();
    let query = supabaseAdmin.from("airports").select("iata,name,city,state").limit(8);
    if (q) query = query.or(`iata.ilike.%${q}%,city.ilike.%${q}%,name.ilike.%${q}%`);
    const { data: rows } = await query.order("iata");
    return (rows ?? []) as AirportOption[];
  });
