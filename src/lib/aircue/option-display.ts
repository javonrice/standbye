/**
 * Display helpers for option timing and visual disambiguation.
 * Does not invent metadata — only formats existing fields.
 */
import {
  formatLocalTimeWithDayOffset,
  localArrivalDayOffset,
} from "@/lib/aircue/local-day-offset";
import type { OptionSegment, StandbyOption } from "@/lib/aircue/standby";

export function optionArrivalDayOffset(option: {
  schedDepUtc?: string | null;
  schedArrUtc?: string | null;
  evidence?: { arrivalDayOffset?: number | null } | null;
}): number | null {
  const stored = option.evidence?.arrivalDayOffset;
  if (typeof stored === "number" && Number.isFinite(stored)) return Math.trunc(stored);
  return localArrivalDayOffset({
    schedDep: option.schedDepUtc,
    schedArr: option.schedArrUtc,
  });
}

/** Arrival clock with +N local calendar-day suffix when known. */
export function formatOptionArrival(option: {
  arrLocal: string;
  schedDepUtc?: string | null;
  schedArrUtc?: string | null;
  evidence?: { arrivalDayOffset?: number | null } | null;
}): string {
  return formatLocalTimeWithDayOffset(option.arrLocal, optionArrivalDayOffset(option));
}

export function formatSegmentArrival(seg: OptionSegment): string {
  const stored = seg.arrivalDayOffset;
  const offset =
    typeof stored === "number" && Number.isFinite(stored)
      ? Math.trunc(stored)
      : localArrivalDayOffset({
          schedDep: seg.schedDepUtc,
          schedArr: seg.schedArrUtc ?? null,
        });
  return formatLocalTimeWithDayOffset(seg.arrLocal, offset);
}

/** Compact dep → arr label used in rows and heroes. */
export function formatOptionTimingRange(option: {
  depLocal: string;
  arrLocal: string;
  schedDepUtc?: string | null;
  schedArrUtc?: string | null;
  evidence?: { arrivalDayOffset?: number | null } | null;
}): string {
  const arr = formatOptionArrival(option);
  if (!option.depLocal) return arr;
  if (!arr) return option.depLocal;
  return `${option.depLocal} → ${arr}`;
}

function viaLabel(option: Pick<StandbyOption, "segments" | "kind">): string | null {
  if (option.kind !== "connection" || option.segments.length < 2) return null;
  const hubs = option.segments.slice(0, -1).map((s) => s.dest.toUpperCase()).filter(Boolean);
  return hubs.length ? hubs.join(" · ") : null;
}

/**
 * When two options share flight label and clock times, surface an existing
 * distinguishing field (routing / access). Returns null when nothing honest
 * distinguishes them — never fabricates terminal/operator text.
 */
export function optionDisambiguationNote(
  option: StandbyOption,
  peers: StandbyOption[],
): string | null {
  const myTiming = formatOptionTimingRange(option);
  const collisions = peers.filter(
    (p) =>
      p.id !== option.id &&
      p.flightLabel === option.flightLabel &&
      formatOptionTimingRange(p) === myTiming,
  );
  if (collisions.length === 0) return null;

  const myVia = viaLabel(option);
  if (myVia) {
    const vias = new Set(
      [option, ...collisions].map(viaLabel).filter((v): v is string => Boolean(v)),
    );
    if (vias.size > 1) return `via ${myVia}`;
  }

  if (option.access) {
    const accesses = new Set(
      [option, ...collisions]
        .map((o) => o.access)
        .filter((a): a is NonNullable<typeof a> => Boolean(a)),
    );
    if (accesses.size > 1) {
      if (option.access === "home") return "Home access";
      if (option.access === "zed") return "ZED access";
      return "Other access";
    }
  }

  return null;
}
