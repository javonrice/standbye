/**
 * Employee-reported loads are stronger evidence than public availability, so
 * they override the availability pillar and can move the judgment.
 */
import type { Judgment, Pillar, PillarState, ReportedLoad, Confidence } from "@/lib/aircue/standby";

export function loadPillar(load: ReportedLoad): Pillar {
  const open = load.openSeats ?? 0;
  const standbys = load.standbys ?? 0;
  const net = open - standbys;

  let state: PillarState = "good";
  let label = "Strong";
  if (net <= 0) {
    state = "poor";
    label = "Oversubscribed";
  } else if (net <= 2) {
    state = "fair";
    label = "Tight";
  } else if (net <= 6) {
    state = "good";
    label = "Workable";
  }

  const detail =
    load.standbys === null
      ? `${open} open seat${open === 1 ? "" : "s"} reported.`
      : `${open} open seat${open === 1 ? "" : "s"} against ${standbys} listed standby${standbys === 1 ? "" : "s"}.`;

  return { key: "availability", state, label, detail };
}

/** Recompute the judgment after a load is attached. */
export function judgeWithLoad(pillars: Pillar[]): Judgment {
  const weight: Record<PillarState, number> = { good: 30, fair: 16, poor: 0, unknown: 18 };
  const w: Record<string, number> = { availability: 1.4, operations: 1.0, recovery: 0.8, history: 0.3 };
  const total = pillars.reduce((sum, p) => sum + weight[p.state] * (w[p.key] ?? 1), 0);
  const max = 30 * pillars.reduce((sum, p) => sum + (w[p.key] ?? 1), 0);
  const score = Math.round((total / max) * 100);
  const availability = pillars.find((p) => p.key === "availability");
  const recovery = pillars.find((p) => p.key === "recovery");
  if (availability?.state === "poor" && recovery?.state === "poor") return "riskier";
  if (score >= 76) return "favorable";
  if (score >= 52) return "mixed";
  return "riskier";
}

export function confidenceWithLoad(pillars: Pillar[]): Confidence {
  const unknowns = pillars.filter((p) => p.state === "unknown").length;
  return unknowns >= 2 ? "medium" : "high";
}
