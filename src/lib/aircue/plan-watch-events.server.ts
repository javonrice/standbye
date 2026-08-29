/** Plan-level watch snapshot helpers and meaningful change detection. */

import { airlineName } from "@/lib/aircue/airlines";
import type { StandbyOption } from "@/lib/aircue/standby";
import type { AccessType } from "@/lib/aircue/travel-access";
import type { WatchFlightState } from "@/lib/aircue/watch-flight-state.server";

export type PlanWatchSnapshot = {
  judgment: string;
  pillars: Record<string, string>;
  largestShowing: number | null;
  laterCount: number;
  flightState?: WatchFlightState;
  primaryOptionId?: string | null;
  preferredOptionId?: string | null;
  /** Backup alternatives excluding primary — used for shrink thresholds. */
  backupRunwayCount?: number;
  backupNonstopCount?: number;
  backupConnectionCount?: number;
  totalRealisticWays?: number;
  spilloverCancelled?: number;
  /** Access composition on the staff-travel runway (excludes ineligible). */
  accessHomeCount?: number;
  accessZedCount?: number;
  accessOtherCount?: number;
  primaryStaffEligibility?: string | null;
};

export type BackupRunway = {
  /** All current realistic staff-travel options, including primary (excludes ineligible). */
  totalRealisticWays: number;
  /** Current options excluding the primary. */
  backupAlternatives: number;
  nonstops: number;
  connections: number;
  homeCount: number;
  zedCount: number;
  otherCount: number;
  /** UI copy: access-aware runway summary. */
  summary: string;
  /** @deprecated Prefer totalRealisticWays; kept for callers expecting `.total`. */
  total: number;
};

export interface RunwayCopyContext {
  /** Home airline IATA for "your airline" phrasing. */
  homeAirline?: string | null;
}

/** Staff-travel runway options — ineligible never counts as a preferred way. */
export function staffTravelOptions(options: StandbyOption[]): StandbyOption[] {
  return options.filter((o) => o.staffEligibility !== "ineligible");
}

function accessCounts(options: StandbyOption[]): {
  homeCount: number;
  zedCount: number;
  otherCount: number;
} {
  let homeCount = 0;
  let zedCount = 0;
  let otherCount = 0;
  for (const o of options) {
    const a: AccessType | null | undefined = o.access;
    if (a === "home") homeCount += 1;
    else if (a === "zed") zedCount += 1;
    else if (a === "other") otherCount += 1;
  }
  return { homeCount, zedCount, otherCount };
}

function accessMixParts(counts: {
  homeCount: number;
  zedCount: number;
  otherCount: number;
}): string[] {
  const parts: string[] = [];
  if (counts.homeCount > 0) parts.push(`${counts.homeCount} Home`);
  if (counts.zedCount > 0) parts.push(`${counts.zedCount} ZED`);
  if (counts.otherCount > 0) parts.push(`${counts.otherCount} other access`);
  return parts;
}

export function computeBackupRunway(
  options: StandbyOption[],
  primaryOptionId?: string | null,
  copy?: RunwayCopyContext,
): BackupRunway {
  const staff = staffTravelOptions(options);
  const totalRealisticWays = staff.length;
  const alternatives = primaryOptionId
    ? staff.filter((o) => o.id !== primaryOptionId)
    : staff.slice(1);

  const nonstops = staff.filter((o) => o.kind === "nonstop").length;
  const connections = staff.filter((o) => o.kind === "connection").length;
  const counts = accessCounts(staff);

  const kindParts: string[] = [];
  if (nonstops > 0) kindParts.push(`${nonstops} nonstop${nonstops === 1 ? "" : "s"}`);
  if (connections > 0) kindParts.push(`${connections} connection${connections === 1 ? "" : "s"}`);
  const mixParts = accessMixParts(counts);

  const home = (copy?.homeAirline ?? "").trim().toUpperCase();
  const airlinePhrase = home ? `on your ${airlineName(home)} access` : "on your airlines";

  const summary =
    totalRealisticWays === 0
      ? `No realistic staff-travel ways remain ${airlinePhrase}`
      : [
          `${totalRealisticWays} realistic way${totalRealisticWays === 1 ? "" : "s"} remain ${airlinePhrase}`,
          ...kindParts,
          ...mixParts,
        ].join(" · ");

  return {
    totalRealisticWays,
    backupAlternatives: alternatives.length,
    nonstops,
    connections,
    homeCount: counts.homeCount,
    zedCount: counts.zedCount,
    otherCount: counts.otherCount,
    summary,
    total: totalRealisticWays,
  };
}

function judgmentRank(j: string): number {
  if (j === "favorable") return 3;
  if (j === "mixed") return 2;
  if (j === "riskier") return 1;
  return 0;
}

function isMateriallyBetter(preferred: StandbyOption, primary: StandbyOption): boolean {
  const pj = judgmentRank(preferred.judgment);
  const pr = judgmentRank(primary.judgment);
  if (pj - pr >= 1) return true;
  return preferred.rank < primary.rank && pj >= pr;
}

export function detectPlanChangeEvents(input: {
  prev: PlanWatchSnapshot;
  preferred: StandbyOption | null;
  primary: StandbyOption | null;
  backup: BackupRunway;
  spilloverCancelled: number;
}): Array<{ kind: string; severity: string; headline: string; detail: string }> {
  const events: Array<{ kind: string; severity: string; headline: string; detail: string }> = [];
  const { prev, preferred, primary, backup, spilloverCancelled } = input;

  if (
    preferred &&
    primary &&
    preferred.id !== primary.id &&
    isMateriallyBetter(preferred, primary)
  ) {
    const prevPreferred = prev.preferredOptionId;
    if (prevPreferred !== preferred.id) {
      events.push({
        kind: "preferred_option_changed",
        severity: "meaningful",
        headline: "Standbye now prefers a different option",
        detail: `${preferred.flightLabel} looks stronger than your primary ${primary.flightLabel}.`,
      });
    }
  }

  const prevBackup = prev.backupRunwayCount ?? backup.backupAlternatives;
  const nextBackup = backup.backupAlternatives;
  if (prevBackup >= 3 && nextBackup <= 1) {
    events.push({
      kind: "backup_runway_shrunk",
      severity: "meaningful",
      headline: nextBackup === 0 ? "You are out of backup options" : "Backup runway thinned out",
      detail: backup.summary,
    });
  } else if (prevBackup >= 1 && nextBackup === 0) {
    events.push({
      kind: "backup_runway_shrunk",
      severity: "meaningful",
      headline: "You are out of backup options",
      detail: backup.summary,
    });
  }

  const prevSpill = prev.spilloverCancelled ?? 0;
  if (spilloverCancelled > prevSpill && spilloverCancelled >= 2) {
    events.push({
      kind: "spillover_pressure",
      severity: "meaningful",
      headline: "Earlier cancellations are adding pressure",
      detail: `${spilloverCancelled} earlier same-route flight${spilloverCancelled === 1 ? "" : "s"} cancelled today.`,
    });
  }

  if (
    preferred &&
    !prev.preferredOptionId &&
    preferred.rank <= 2 &&
    judgmentRank(preferred.judgment) >= 3
  ) {
    events.push({
      kind: "strong_alternate_appeared",
      severity: "context",
      headline: "A strong alternate appeared",
      detail: `${preferred.flightLabel} is now among the best options in this plan.`,
    });
  }

  // Access composition — never emit solely for coverage gaps.
  const prevHome = prev.accessHomeCount ?? 0;
  const prevZed = prev.accessZedCount ?? 0;
  const prevOther = prev.accessOtherCount ?? 0;
  const hadPriorComposition =
    prev.accessHomeCount !== undefined ||
    prev.accessZedCount !== undefined ||
    prev.accessOtherCount !== undefined;
  if (hadPriorComposition) {
    const homeLost = prevHome > 0 && backup.homeCount === 0 && backup.totalRealisticWays > 0;
    const zedCollapsed = prevZed >= 2 && backup.zedCount === 0;
    const mixCollapsed =
      prevHome + prevZed + prevOther >= 3 &&
      backup.homeCount + backup.zedCount + backup.otherCount <= 1 &&
      backup.totalRealisticWays > 0;
    if (homeLost || zedCollapsed || mixCollapsed) {
      events.push({
        kind: "access_composition_changed",
        severity: "meaningful",
        headline: homeLost
          ? "Home airline options left the runway"
          : "Your access mix on this plan changed",
        detail: backup.summary,
      });
    }
  }

  const prevElig = prev.primaryStaffEligibility ?? null;
  const nextElig = primary?.staffEligibility ?? null;
  if (
    prevElig &&
    nextElig &&
    prevElig !== nextElig &&
    (nextElig === "ineligible" || nextElig === "eligible")
  ) {
    events.push({
      kind: "primary_eligibility_changed",
      severity: nextElig === "ineligible" ? "meaningful" : "context",
      headline:
        nextElig === "ineligible"
          ? "Primary may not be valid staff travel"
          : "Primary staff-travel access confirmed",
      detail:
        nextElig === "ineligible"
          ? `${primary?.flightLabel ?? "Primary"}’s operating carrier is outside your declared travel access.`
          : `${primary?.flightLabel ?? "Primary"} operator verification is now eligible.`,
    });
  }

  return events;
}

export function buildPlanWatchSnapshot(input: {
  anchor: StandbyOption | null;
  preferred: StandbyOption | null;
  primaryOptionId: string | null;
  flightState: WatchFlightState;
  backup: BackupRunway;
  spilloverCancelled: number;
  prev?: PlanWatchSnapshot;
  primary?: StandbyOption | null;
}): PlanWatchSnapshot {
  const anchor = input.anchor;
  const primary = input.primary ?? null;
  return {
    judgment: anchor?.judgment ?? input.prev?.judgment ?? "mixed",
    pillars: Object.fromEntries((anchor?.pillars ?? []).map((p) => [p.key, p.state])),
    largestShowing: anchor?.evidence.availability.largestShowing ?? input.prev?.largestShowing ?? null,
    laterCount: anchor?.evidence?.recovery?.laterNonstops?.length ?? input.prev?.laterCount ?? 0,
    flightState: input.flightState,
    primaryOptionId: input.primaryOptionId,
    preferredOptionId: input.preferred?.id ?? null,
    backupRunwayCount: input.backup.backupAlternatives,
    backupNonstopCount: input.backup.nonstops,
    backupConnectionCount: input.backup.connections,
    totalRealisticWays: input.backup.totalRealisticWays,
    spilloverCancelled: input.spilloverCancelled,
    accessHomeCount: input.backup.homeCount,
    accessZedCount: input.backup.zedCount,
    accessOtherCount: input.backup.otherCount,
    primaryStaffEligibility: primary?.staffEligibility ?? input.prev?.primaryStaffEligibility ?? null,
  };
}

/** Anchor-option movement events (availability, ops, recovery on the watched leg). */
export function detectAnchorOptionEvents(
  prev: PlanWatchSnapshot,
  fresh: StandbyOption | null,
): Array<{ kind: string; severity: string; headline: string; detail: string }> {
  const events: Array<{ kind: string; severity: string; headline: string; detail: string }> = [];
  if (!fresh) return events;

  if (fresh.judgment !== prev.judgment) {
    events.push({
      kind: "judgment",
      severity: "meaningful",
      headline:
        fresh.judgment === "favorable"
          ? "This setup improved"
          : fresh.judgment === "riskier"
            ? "This setup got harder"
            : "This setup shifted",
      detail: fresh.headline,
    });
  }

  const prevLargest = prev.largestShowing;
  const nextLargest = fresh.evidence.availability.largestShowing;
  if (prevLargest !== null && nextLargest !== null && nextLargest < prevLargest) {
    events.push({
      kind: "availability",
      severity: nextLargest === 0 ? "meaningful" : "context",
      headline:
        nextLargest === 0 ? "Public availability has closed" : "Public availability tightened",
      detail: `Booking now shows for parties up to ${nextLargest}, down from ${prevLargest}. This is a demand signal, not a load.`,
    });
  }

  const prevOps = prev.pillars?.["operations"];
  const nextOps = fresh.pillars.find((p) => p.key === "operations")?.state;
  if (prevOps && nextOps && prevOps !== nextOps && nextOps === "poor") {
    events.push({
      kind: "operations_deteriorated",
      severity: "meaningful",
      headline: "Operations turned against this plan",
      detail: fresh.pillars.find((p) => p.key === "operations")?.detail ?? "",
    });
  }

  // Coverage gaps alone never produce events (faa/history not_covered/unavailable).
  const laterNow = fresh.evidence?.recovery?.laterNonstops?.length ?? 0;
  if (laterNow < (prev.laterCount ?? 0)) {
    events.push({
      kind: "recovery",
      severity: laterNow === 0 ? "meaningful" : "context",
      headline: laterNow === 0 ? "You are out of backup options" : "Backup options thinned out",
      detail: fresh.evidence.recovery?.summary ?? "",
    });
  }

  return events;
}

export function spilloverFromOption(option: StandbyOption | null): number {
  if (!option) return 0;
  const ops = option.pillars.find((p) => p.key === "operations");
  if (!ops?.detail) return 0;
  const match = ops.detail.match(/(\d+)\s+earlier/i);
  return match ? Number(match[1]) : 0;
}
