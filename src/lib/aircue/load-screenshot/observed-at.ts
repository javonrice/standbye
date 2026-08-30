import type { TimestampSource } from "@/lib/aircue/load-screenshot/types";
import type { ParseResult } from "@/lib/aircue/load-screenshot/types";

export interface ObservedAtResolution {
  observedAt: string;
  timestampSource: TimestampSource;
  timestampConfidence: number;
  /** True when UI should ask “Was this load checked recently?” */
  askRecentConfirm: boolean;
}

/**
 * Priority: screenshot timestamp → file metadata → inferred upload.
 * Interrupt only when ambiguity may change the recommendation (stale-looking).
 */
export function resolveObservedAt(input: {
  parse?: Pick<ParseResult, "observedAtGuess"> | null;
  fileLastModifiedMs?: number | null;
  nowMs?: number;
  hoursToDeparture?: number | null;
}): ObservedAtResolution {
  const now = input.nowMs ?? Date.now();

  if (input.parse?.observedAtGuess?.at) {
    const t = Date.parse(input.parse.observedAtGuess.at);
    if (Number.isFinite(t)) {
      return {
        observedAt: new Date(t).toISOString(),
        timestampSource: "screenshot",
        timestampConfidence: input.parse.observedAtGuess.confidence ?? 0.7,
        askRecentConfirm: false,
      };
    }
  }

  if (input.fileLastModifiedMs && Number.isFinite(input.fileLastModifiedMs)) {
    const ageH = (now - input.fileLastModifiedMs) / 3_600_000;
    const ask =
      ageH > 6 ||
      (input.hoursToDeparture != null &&
        input.hoursToDeparture <= 6 &&
        ageH > 2);
    return {
      observedAt: new Date(input.fileLastModifiedMs).toISOString(),
      timestampSource: "metadata",
      timestampConfidence: 0.55,
      askRecentConfirm: ask,
    };
  }

  return {
    observedAt: new Date(now).toISOString(),
    timestampSource: "inferred_upload",
    timestampConfidence: 0.4,
    askRecentConfirm: false,
  };
}
