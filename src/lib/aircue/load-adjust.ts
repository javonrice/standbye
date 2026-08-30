/**
 * Employee-reported loads are stronger evidence than the public booking check,
 * so they replace the availability pillar and can move the judgment.
 *
 * Interpretation is party-aware: the same "4 open · 3 listed" report means
 * something different for a solo traveller than for a family of four who are
 * not on the list yet. Freshness and source change how much we trust the
 * report — they never turn it into a clearance probability.
 */
import type { Judgment, Pillar, PillarState, ReportedLoad, Confidence } from "@/lib/aircue/standby";

export interface LoadContext {
  /** How many people are travelling on this plan. */
  partySize: number;
  /** Override for tests. */
  now?: string;
}

export interface LoadReading {
  partySize: number;
  effectiveDemand: number;
  cushion: number;
  /** Party inclusion was unknown, so demand may be understated. */
  uncertain: boolean;
  ageHours: number;
  stale: boolean;
}

const STALE_AFTER_HOURS = 6;

function clampParty(size: number | null | undefined): number {
  const n = Math.round(Number(size ?? 1));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function ageInHours(checkedAt: string, now: string | undefined): number {
  const then = Date.parse(checkedAt);
  const ref = now ? Date.parse(now) : Date.now();
  if (!Number.isFinite(then) || !Number.isFinite(ref)) return 0;
  return Math.max(0, (ref - then) / 3_600_000);
}

/** What the report means once the traveller's own party is accounted for. */
export function readLoad(load: ReportedLoad, ctx: LoadContext): LoadReading {
  const partySize = clampParty(ctx.partySize);
  const open = load.openSeats ?? 0;
  const listed = load.standbys ?? 0;

  let effectiveDemand = listed;
  let uncertain = false;
  if (load.partyIncluded === "no") {
    effectiveDemand = listed + partySize;
  } else if (load.partyIncluded === "unsure" || load.partyIncluded === null) {
    uncertain = true;
  }

  const ageHours = ageInHours(load.checkedAt, ctx.now);

  return {
    partySize,
    effectiveDemand,
    cushion: open - effectiveDemand,
    uncertain,
    ageHours,
    stale: ageHours > STALE_AFTER_HOURS,
  };
}

const ORDER: PillarState[] = ["poor", "fair", "good"];

function downgrade(state: PillarState): PillarState {
  const i = ORDER.indexOf(state);
  return i > 0 ? ORDER[i - 1]! : state;
}

function describeAge(hours: number): string {
  if (hours < 1) return "Checked just now.";
  if (hours < 2) return "Checked about an hour ago.";
  if (hours < 24) return `Checked about ${Math.round(hours)} hours ago.`;
  return "Checked more than a day ago.";
}

export function loadPillar(load: ReportedLoad, ctx: LoadContext): Pillar {
  const reading = readLoad(load, ctx);
  const { cushion, partySize } = reading;

  let state: PillarState;
  let label: string;
  if (cushion < 0) {
    state = "poor";
    label = "Oversubscribed";
  } else if (cushion === 0) {
    state = "fair";
    label = "Right at the line";
  } else if (cushion < partySize) {
    state = "fair";
    label = "Tight";
  } else if (cushion < partySize * 3) {
    state = "good";
    label = "Workable";
  } else {
    state = "good";
    label = "Strong";
  }

  // Unknown party inclusion may understate demand; stale reports may be wrong.
  if (reading.uncertain && cushion < partySize) state = downgrade(state);
  if (reading.stale) state = downgrade(state);

  const open = load.openSeats ?? 0;
  const listed = load.standbys ?? 0;
  const parts: string[] = [];
  parts.push(
    load.standbys === null
      ? `${open} open seat${open === 1 ? "" : "s"} reported`
      : `${open} open seat${open === 1 ? "" : "s"} against ${listed} listed standby${listed === 1 ? "" : "s"}`,
  );

  if (load.partyIncluded === "no") {
    parts.push(`plus your party of ${partySize}`);
  } else if (load.partyIncluded === "yes" && partySize > 1) {
    parts.push(`with your party of ${partySize} already listed`);
  } else if (reading.uncertain) {
    parts.push("and we don't know if you're already counted");
  }

  const cushionText =
    cushion < 0
      ? `${Math.abs(cushion)} more standby${Math.abs(cushion) === 1 ? "" : "s"} than seats`
      : cushion === 0
        ? "no cushion left"
        : `${cushion} seat${cushion === 1 ? "" : "s"} of cushion`;

  const detail = `${parts.join(", ")} — ${cushionText}. ${describeAge(reading.ageHours)}`;

  return { key: "availability", state, label, detail };
}

/** 0–100 score for the pillar set, used for judgment and for re-ranking. */
export function scoreWithLoad(pillars: Pillar[]): number {
  const weight: Record<PillarState, number> = { good: 30, fair: 16, poor: 0, unknown: 18 };
  const w: Record<string, number> = { availability: 1.4, operations: 1.0, recovery: 0.8, history: 0.3 };
  const total = pillars.reduce((sum, p) => sum + weight[p.state] * (w[p.key] ?? 1), 0);
  const max = 30 * pillars.reduce((sum, p) => sum + (w[p.key] ?? 1), 0);
  if (max === 0) return 0;
  return Math.round((total / max) * 100);
}

/** Recompute the judgment after a load is attached. */
export function judgeWithLoad(pillars: Pillar[]): Judgment {
  const score = scoreWithLoad(pillars);
  const availability = pillars.find((p) => p.key === "availability");
  const recovery = pillars.find((p) => p.key === "recovery");
  if (availability?.state === "poor" && recovery?.state === "poor") return "riskier";
  if (score >= 76) return "favorable";
  if (score >= 52) return "mixed";
  return "riskier";
}

export function confidenceWithLoad(
  pillars: Pillar[],
  reading?: LoadReading | undefined,
): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  if (reading && (reading.uncertain || reading.stale)) return unknowns >= 2 ? "low" : "medium";
  return unknowns >= 2 ? "medium" : "high";
}
