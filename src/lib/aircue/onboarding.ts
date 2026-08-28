/** Client-side onboarding draft: collected before the user has an account. */

export type AccessMode = "home" | "partners" | "selected";

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
  checking_loads: "You told us the constant checking is the worst part. This is where that stops.",
  plan_b: "You told us Plan B is the hard part. Recovery is the thing Standbye weighs first.",
  all_of_it: "You told us it's all of it. So here is the whole thing in four small stories.",
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
  partners: "Home airline + partner / ZED airlines",
  selected: "Only airlines I select",
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

/** Airlines Standbye may consider, derived from the access answers. */
export function resolvedAccess(draft: OnboardingDraft): string[] {
  if (draft.accessMode === "home") return [draft.homeAirline];
  if (draft.accessMode === "selected") {
    return Array.from(new Set([draft.homeAirline, ...draft.airlineAccess]));
  }
  return [];
}
