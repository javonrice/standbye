import type { AirlineLoadVisibility } from "@/lib/aircue/load-screenshot/types";
import { normalizeAirlineCode } from "@/lib/aircue/load-screenshot/contribute-auth";

const DEFAULT_VISIBILITY: AirlineLoadVisibility = "restricted";

/** In-memory fallback when DB policy row is missing (unknown airline = restricted). */
export function defaultVisibilityForAirline(airline: string | null | undefined): AirlineLoadVisibility {
  const code = normalizeAirlineCode(airline);
  if (code === "UA") return "eligible_reuse";
  return DEFAULT_VISIBILITY;
}

export function visibilityAllowsReuse(visibility: AirlineLoadVisibility): boolean {
  return visibility === "eligible_reuse";
}

export async function resolveAirlineVisibility(
  client: { from: (t: string) => unknown },
  airline: string | null | undefined,
): Promise<AirlineLoadVisibility> {
  const code = normalizeAirlineCode(airline);
  if (!code) return DEFAULT_VISIBILITY;
  try {
    const q = client.from("airline_load_policies") as {
      select: (c: string) => {
        eq: (a: string, b: string) => {
          maybeSingle: () => Promise<{ data: { visibility?: string } | null }>;
        };
      };
    };
    const { data } = await q.select("visibility").eq("airline", code).maybeSingle();
    const v = data?.visibility;
    if (
      v === "private" ||
      v === "eligible_reuse" ||
      v === "aggregate_only" ||
      v === "restricted"
    ) {
      return v;
    }
  } catch {
    /* fall through */
  }
  return defaultVisibilityForAirline(code);
}
