/**
 * Canonical Travel Access: home | zed | other per IATA.
 * Never infers alliance eligibility. Airline-general (home ≠ UA).
 */

export type AccessMode = "home" | "partners" | "selected";

export type AccessType = "home" | "zed" | "other";

export type AirlineAccessMeta = Record<string, { type: AccessType }>;

export interface OnboardingAccessDraft {
  homeAirline: string;
  accessMode: AccessMode | "";
  airlineAccess: string[];
}

export interface TravelAccessResolution {
  /** Declared staff-travel carrier codes (uppercase IATA). */
  codes: string[];
  meta: AirlineAccessMeta;
  homeAirline: string | null;
  accessMode: AccessMode | string | null;
}

const IATA_RE = /^[A-Z0-9]{2,3}$/;

function isIata(code: string): boolean {
  const c = code.toUpperCase();
  return IATA_RE.test(c) && c !== "ANY" && c !== "ALL" && c !== "HOME";
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Build meta from onboarding draft answers. */
export function buildAccessMetaFromDraft(draft: OnboardingAccessDraft): AirlineAccessMeta {
  const home = normalizeCode(draft.homeAirline);
  const meta: AirlineAccessMeta = {};
  if (home && isIata(home)) meta[home] = { type: "home" };

  if (draft.accessMode === "partners") {
    for (const raw of draft.airlineAccess) {
      const code = normalizeCode(raw);
      if (!isIata(code) || code === home) continue;
      meta[code] = { type: "zed" };
    }
  } else if (draft.accessMode === "selected") {
    for (const raw of draft.airlineAccess) {
      const code = normalizeCode(raw);
      if (!isIata(code) || code === home) continue;
      meta[code] = { type: "other" };
    }
  }
  return meta;
}

/** Persistable airline_access list (IATA only) from draft. */
export function resolvedAccessCodes(draft: OnboardingAccessDraft): string[] {
  return Object.keys(buildAccessMetaFromDraft(draft));
}

/**
 * Resolve Travel Access from a saved profile.
 * Legacy: home airline → home; IATA in airline_access without meta → other.
 * Never invents alliance partners. Missing home ≠ UA.
 */
export function resolveTravelAccess(profile: {
  homeAirline?: string | null | undefined;
  airlineAccess?: string[] | null | undefined;
  accessMode?: string | null | undefined;
  airlineAccessMeta?: AirlineAccessMeta | null | undefined;
}): TravelAccessResolution {
  const homeRaw = (profile.homeAirline ?? "").trim();
  const homeAirline = homeRaw && isIata(homeRaw) ? normalizeCode(homeRaw) : null;
  const accessMode = profile.accessMode ?? null;

  const storedMeta = profile.airlineAccessMeta ?? {};
  const meta: AirlineAccessMeta = {};

  for (const [raw, entry] of Object.entries(storedMeta)) {
    const code = normalizeCode(raw);
    if (!isIata(code) || !entry?.type) continue;
    if (entry.type === "home" || entry.type === "zed" || entry.type === "other") {
      meta[code] = { type: entry.type };
    }
  }

  if (homeAirline) {
    meta[homeAirline] = { type: "home" };
  }

  const legacyCodes = (profile.airlineAccess ?? []).map(normalizeCode).filter(isIata);

  for (const code of legacyCodes) {
    if (meta[code]) continue;
    if (homeAirline && code === homeAirline) {
      meta[code] = { type: "home" };
    } else if (accessMode === "partners") {
      meta[code] = { type: "zed" };
    } else {
      meta[code] = { type: "other" };
    }
  }

  if (accessMode === "home" && homeAirline) {
    return {
      codes: [homeAirline],
      meta: { [homeAirline]: { type: "home" } },
      homeAirline,
      accessMode,
    };
  }

  const codes = Object.keys(meta).sort();
  return { codes, meta, homeAirline, accessMode };
}

/**
 * Plan search preference ⊆ Travel Access.
 * selectedCarriers null/empty → all saved access.
 * Never expands beyond savedTravelAccess. No staff-travel "all".
 */
export function effectiveStaffTravelCarriers(
  saved: TravelAccessResolution,
  selectedCarriers: string[] | null | undefined,
): string[] {
  const allowed = new Set(saved.codes);
  if (!selectedCarriers || selectedCarriers.length === 0) {
    return [...saved.codes];
  }
  const selected = selectedCarriers.map(normalizeCode).filter(isIata);
  const effective = selected.filter((c) => allowed.has(c));
  if (effective.length === 0 && selected.length > 0) {
    return [];
  }
  return effective.length > 0 ? effective : [...saved.codes];
}

export function accessTypeForCarrier(
  meta: AirlineAccessMeta,
  carrier: string | null | undefined,
): AccessType | null {
  if (!carrier) return null;
  const code = normalizeCode(carrier);
  return meta[code]?.type ?? null;
}

/** Snapshot shape stored on plans.prefs */
export function travelAccessSnapshot(saved: TravelAccessResolution, effective: string[]) {
  return {
    travelAccessSnapshot: {
      codes: saved.codes,
      meta: saved.meta,
      homeAirline: saved.homeAirline,
      accessMode: saved.accessMode,
    },
    effectiveCarriers: effective,
    accessMetaSnapshot: saved.meta,
  };
}
