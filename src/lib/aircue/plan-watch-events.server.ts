/** Plan-level watch snapshot helpers and meaningful change detection. */

import type { StandbyOption } from "@/lib/aircue/standby";
import type { WatchFlightState } from "@/lib/aircue/watch-flight-state.server";

export type PlanWatchSnapshot = {
  judgment: string;
  pillars: Record<string, string>;
  largestShowing: number | null;
  laterCount: number;
  flightState?: WatchFlightState;
  primaryOptionId?: string | null;
  preferredOptionId?: string | null;
  backupRunwayCount?: number;
  backupNonstopCount?: number;
  backupConnectionCount?: number;
  spilloverCancelled?: number;
};

export type BackupRunway = {
  total: number;
  nonstops: number;
  connections: number;
  summary: string;
};

export function computeBackupRunway(options: StandbyOption[]): BackupRunway {
  const nonstops = options.filter((o) => o.kind === "nonstop").length;
  const connections = options.filter((o) => o.kind === "connection").length;
  const total = options.length;
  const parts: string[] = [];
  if (nonstops > 0) parts.push(`${nonstops} nonstop${nonstops === 1 ? "" : "s"}`);
  if (connections > 0) parts.push(`${connections} connection${connections === 1 ? "" : "s"}`);
  const summary =
    total === 0
      ? "No realistic ways remain"
      : `${total} realistic way${total === 1 ? "" : "s"} remain${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
  return { total, nonstops, connections, summary };
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
  return preferred.score - primary.score >= 15;
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

  const prevBackup = prev.backupRunwayCount ?? backup.total;
  if (prevBackup >= 3 && backup.total <= 1) {
    events.push({
      kind: "backup_runway_shrunk",
      severity: backup.total === 0 ? "meaningful" : "meaningful",
      headline:
        backup.total === 0 ? "You are out of backup options" : "Backup runway thinned out",
      detail: backup.summary,
    });
  } else if (prevBackup >= 1 && backup.total === 0) {
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

  if (preferred && !prev.preferredOptionId && preferred.rank <= 2 && judgmentRank(preferred.judgment) >= 3) {
    events.push({
      kind: "strong_alternate_appeared",
      severity: "context",
      headline: "A strong alternate appeared",
      detail: `${preferred.flightLabel} is now among the best options in this plan.`,
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
}): PlanWatchSnapshot {
  const anchor = input.anchor;
  return {
    judgment: anchor?.judgment ?? input.prev?.judgment ?? "mixed",
    pillars: Object.fromEntries((anchor?.pillars ?? []).map((p) => [p.key, p.state])),
    largestShowing: anchor?.evidence.availability.largestShowing ?? input.prev?.largestShowing ?? null,
    laterCount: anchor?.evidence?.recovery?.laterNonstops?.length ?? input.prev?.laterCount ?? 0,
    flightState: input.flightState,
    primaryOptionId: input.primaryOptionId,
    preferredOptionId: input.preferred?.id ?? null,
    backupRunwayCount: input.backup.total,
    backupNonstopCount: input.backup.nonstops,
    backupConnectionCount: input.backup.connections,
    spilloverCancelled: input.spilloverCancelled,
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
