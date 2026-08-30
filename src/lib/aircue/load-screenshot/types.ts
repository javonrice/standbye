/**
 * Client-safe types for screenshot → structured load extraction.
 * Providers (Gemini, Lovable, mock) implement LoadScreenshotParser.
 */

export type TimestampSource =
  | "screenshot"
  | "metadata"
  | "inferred_upload"
  | "user_confirmed";

export type AirlineLoadVisibility =
  | "private"
  | "eligible_reuse"
  | "aggregate_only"
  | "restricted";

export interface ExtractedFlightLoad {
  airline?: string;
  flightNumber?: string;
  origin?: string;
  dest?: string;
  date?: string;
  depLocal?: string;
  cabin?: string;
  openSeats?: number | null;
  standbys?: number | null;
  /** Per-field 0–1 confidence when the provider supplies it. */
  fieldConfidence?: Record<string, number>;
}

export interface ParseResult {
  provider: string;
  model: string;
  confidence: number;
  flights: ExtractedFlightLoad[];
  observedAtGuess?: {
    at: string;
    source: "screenshot" | "metadata";
    confidence: number;
  };
  rawMeta?: unknown;
  usage?: {
    units?: number;
    costUsdEstimate?: number;
    requestId?: string;
  };
}

export interface LoadScreenshotParserInput {
  imageBytes: Uint8Array;
  mimeType: string;
  /** Parsing aid only — never contribution authorization. */
  airlineHint?: string;
}

/**
 * Drop-in vision provider. Swap via LOAD_SCREENSHOT_PROVIDER env
 * (gemini_flash | lovable | mock). Product code must not import vendors
 * outside providers/.
 */
export interface LoadScreenshotParser {
  readonly providerId: string;
  parseScreenshot(input: LoadScreenshotParserInput): Promise<ParseResult>;
}

/** JSON Schema describing ExtractedFlightLoad[] for structured-output providers. */
export const EXTRACTED_FLIGHTS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["flights", "confidence"],
  properties: {
    confidence: { type: "number" },
    observedAtIso: { type: ["string", "null"] },
    flights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          airline: { type: ["string", "null"] },
          flightNumber: { type: ["string", "null"] },
          origin: { type: ["string", "null"] },
          dest: { type: ["string", "null"] },
          date: { type: ["string", "null"] },
          depLocal: { type: ["string", "null"] },
          cabin: { type: ["string", "null"] },
          openSeats: { type: ["number", "null"] },
          standbys: { type: ["number", "null"] },
        },
      },
    },
  },
} as const;
