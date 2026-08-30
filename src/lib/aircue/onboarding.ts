/** Client-side onboarding draft: collected before the user has an account. */

import {
  buildAccessMetaFromDraft,
  resolvedAccessCodes,
  resolveTravelAccess,
  type AccessMode,
  type AirlineAccessMeta,
} from "@/lib/aircue/travel-access";

export type { AccessMode };
export { buildAccessMetaFromDraft };

export interface OnboardingDraft {
  painPoint: string;
  travelerType: string;
  homeAirline: string;
  accessMode: AccessMode | "";
  airlineAccess: string[];
  homeAirport: string;
}

export const painOptions = [
  { value: "which_flight", emoji: "✈️", label: "Figuring out which flight I should actually try" },
  { value: "checking_loads", emoji: "👀", label: "Checking loads over and over again" },
  { value: "plan_b", emoji: "🔀", label: "Figuring out Plan B if the first flight gets bad" },
  { value: "all_of_it", emoji: "😩", label: "Honestly… all of it" },
] as const;

/** Short reflection used later in the funnel, keyed by the pain they picked. */
export const painEcho: Record<string, string> = {
  which_flight: "You told us picking the flight is the hard part. This is that part.",
  checking_loads:
    "You told us the constant checking is the worst part. Standbye helps you know when another look is worth it.",
  plan_b: "You told us Plan B is the hard part. Recovery is the thing Standbye weighs first.",
  all_of_it: "You told us it's all of it. So here's how Standbye puts the whole day together.",
};

export const travelerOptions = [
  { value: "employee", emoji: "👔", label: "Airline employee" },
  { value: "spouse", emoji: "👨‍👩‍👧", label: "Spouse / dependent" },
  { value: "retiree", emoji: "✈️", label: "Retiree" },
  { value: "buddy", emoji: "🎟", label: "Buddy / companion" },
  { value: "other", emoji: "•", label: "Other" },
] as const;

export const travelerLabel: Record<string, string> = {
  employee: "Employee",
  spouse: "Spouse / dependent",
  retiree: "Retiree",
  buddy: "Buddy / companion",
  other: "Other",
};

export const popularAirlines = ["UA", "AA", "DL", "WN", "B6", "AS"];

export const accessModeLabel: Record<AccessMode, string> = {
  home: "My home airline",
  partners: "Home airline + ZED / interline airlines I can use",
  selected: "Only airlines I select",
};

/** Clarifies ZED/interline is user-declared — never alliance membership. */
export const accessModeHint: Record<AccessMode, string> = {
  home: "Standbye will only consider your home airline for staff travel.",
  partners:
    "Include airlines where you know you can staff travel through ZED, interline, or another employee benefit. Alliance membership alone is not enough.",
  selected: "Pick exactly which airlines you can staff travel on (plus your home airline).",
};

export const emptyDraft: OnboardingDraft = {
  painPoint: "",
  travelerType: "",
  homeAirline: "",
  accessMode: "",
  airlineAccess: [],
  homeAirport: "",
};

const KEY = "aircue.onboarding.draft";

export function saveDraft(draft: OnboardingDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — the funnel still works in memory */
  }
}

export function readDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    return { ...emptyDraft, ...(JSON.parse(raw) as Partial<OnboardingDraft>) };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** Airlines Standbye may consider, derived from the access answers (IATA only). */
export function resolvedAccess(draft: OnboardingDraft): string[] {
  return resolvedAccessCodes(draft);
}

/**
 * Airlines Standbye may consider for a saved profile.
 * Never expands to unfiltered "any/all" staff travel — only declared access.
 * Missing home with no codes → empty list (never invent UA).
 */
export function profileCarriers(profile: {
  homeAirline?: string | null | undefined;
  airlineAccess?: string[] | null | undefined;
  accessMode?: string | null | undefined;
  airlineAccessMeta?: AirlineAccessMeta | null | undefined;
}): string[] {
  return resolveTravelAccess(profile).codes;
}
