/**
 * Canonical airport resolution for FK-safe Plan persistence.
 * Uses local airports DB only — does not call AeroDataBox.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export class UnresolvedAirportError extends Error {
  readonly codes: string[];
  constructor(codes: string[]) {
    const list = codes.join(", ");
    super(
      codes.length === 1
        ? `We don't recognize airport ${list} yet.`
        : `We don't recognize airports ${list} yet.`,
    );
    this.name = "UnresolvedAirportError";
    this.codes = codes;
  }
}

/** Ensure each IATA exists in public.airports before FK-backed Plan persist. */
export async function ensureCanonicalAirports(
  client: unknown,
  iatas: string[],
): Promise<
  | { ok: true; found: string[] }
  | { ok: false; missing: string[]; queryFailed?: boolean }
> {
  const codes = [
    ...new Set(
      iatas
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z]{3}$/.test(c)),
    ),
  ];
  if (codes.length === 0) return { ok: false, missing: [], queryFailed: true };

  const db = client as Db;
  const { data, error } = await db.from("airports").select("iata").in("iata", codes);
  if (error) {
    console.error("[ensureCanonicalAirports]", error.message);
    return { ok: false, missing: codes, queryFailed: true };
  }
  const found = ((data ?? []) as Array<{ iata: string }>).map((r) => r.iata.toUpperCase());
  const foundSet = new Set(found);
  const missing = codes.filter((c) => !foundSet.has(c));
  if (missing.length) return { ok: false, missing };
  return { ok: true, found };
}

export async function requireCanonicalAirports(client: unknown, iatas: string[]): Promise<void> {
  const result = await ensureCanonicalAirports(client, iatas);
  if (!result.ok) {
    throw new UnresolvedAirportError(result.missing.length ? result.missing : iatas);
  }
}

export async function airportCountry(
  client: unknown,
  iata: string,
): Promise<string | null> {
  const db = client as Db;
  const { data } = await db
    .from("airports")
    .select("country")
    .eq("iata", iata.toUpperCase())
    .maybeSingle();
  return data ? ((data as { country: string | null }).country ?? null) : null;
}
