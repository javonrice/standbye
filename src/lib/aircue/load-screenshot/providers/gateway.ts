/**
 * Lovable AI Gateway vision parser — cheapest vision-capable model.
 * Uses google/gemini-3.1-flash-lite via /v1/chat/completions.
 * Requires LOVABLE_API_KEY (auto-provisioned, server-only).
 */
import type {
  ExtractedFlightLoad,
  LoadScreenshotParser,
  LoadScreenshotParserInput,
  ParseResult,
} from "@/lib/aircue/load-screenshot/types";
import { EXTRACTED_FLIGHTS_JSON_SCHEMA } from "@/lib/aircue/load-screenshot/types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.1-flash-lite";

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export class GatewayLoadScreenshotParser implements LoadScreenshotParser {
  readonly providerId = "lovable_gateway";

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env["LOAD_SCREENSHOT_MODEL"]?.trim() || DEFAULT_MODEL,
  ) {}

  async parseScreenshot(input: LoadScreenshotParserInput): Promise<ParseResult> {
    const prompt = [
      "Extract standby / employee-travel load rows from this airline screenshot.",
      "Return JSON only matching the schema: flights array with airline IATA, flightNumber,",
      "origin, dest, date (YYYY-MM-DD if visible), depLocal, cabin, openSeats, standbys.",
      "openSeats = available/open seats; standbys = listed standby count when visible.",
      "If a field is unreadable, use null. Do not invent flights.",
      input.airlineHint ? `Airline hint (not authoritative): ${input.airlineHint}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const dataUrl = `data:${input.mimeType || "image/jpeg"};base64,${bytesToBase64(input.imageBytes)}`;

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "extracted_flights",
            strict: false,
            schema: EXTRACTED_FLIGHTS_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new Error("Screenshot reading is busy right now. Try again in a moment.");
      }
      if (res.status === 402) {
        throw new Error(
          "Screenshot reading is temporarily unavailable (AI credits exhausted). Enter loads manually for now.",
        );
      }
      throw new Error(
        `Load screenshot parse failed (${res.status}): ${errText.slice(0, 240)}`,
      );
    }

    const json = (await res.json()) as {
      id?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    let parsed: {
      flights?: ExtractedFlightLoad[];
      confidence?: number;
      observedAtIso?: string | null;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error("Load screenshot model returned non-JSON content");
    }

    const tokens = json.usage?.total_tokens ?? 0;

    return {
      provider: this.providerId,
      model: this.model,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.75,
      flights: Array.isArray(parsed.flights) ? parsed.flights : [],
      ...(parsed.observedAtIso
        ? {
            observedAtGuess: {
              at: parsed.observedAtIso,
              source: "screenshot" as const,
              confidence: 0.7,
            },
          }
        : {}),
      usage: {
        ...(tokens ? { units: tokens } : {}),
        ...(json.id ? { requestId: json.id } : {}),
      },
    };
  }
}
