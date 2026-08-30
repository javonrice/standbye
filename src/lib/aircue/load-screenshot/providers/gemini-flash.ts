/**
 * Google Gemini Flash vision → structured ExtractedFlightLoad[].
 * Drop-in LoadScreenshotParser. Requires GEMINI_API_KEY.
 */
import type {
  ExtractedFlightLoad,
  LoadScreenshotParser,
  LoadScreenshotParserInput,
  ParseResult,
} from "@/lib/aircue/load-screenshot/types";
import { EXTRACTED_FLIGHTS_JSON_SCHEMA } from "@/lib/aircue/load-screenshot/types";

const DEFAULT_MODEL = "gemini-2.5-flash";

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export class GeminiFlashLoadScreenshotParser implements LoadScreenshotParser {
  readonly providerId = "gemini_flash";

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env["GEMINI_MODEL"]?.trim() || DEFAULT_MODEL,
  ) {}

  async parseScreenshot(input: LoadScreenshotParserInput): Promise<ParseResult> {
    const model = this.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

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

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: input.mimeType || "image/jpeg",
                data: bytesToBase64(input.imageBytes),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: EXTRACTED_FLIGHTS_JSON_SCHEMA,
        temperature: 0.1,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini Flash parse failed (${res.status}): ${errText.slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number };
      responseId?: string;
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: {
      flights?: ExtractedFlightLoad[];
      confidence?: number;
      observedAtIso?: string | null;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error("Gemini Flash returned non-JSON content");
    }

    const tokens = json.usageMetadata?.totalTokenCount ?? 0;
    // Rough paid-tier estimate: ignore free tier; ~$0.30/1M in + $2.50/1M out blended.
    const costUsdEstimate = tokens > 0 ? (tokens / 1_000_000) * 1.0 : undefined;

    return {
      provider: this.providerId,
      model,
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
        ...(costUsdEstimate !== undefined ? { costUsdEstimate } : {}),
        ...(json.responseId ? { requestId: json.responseId } : {}),
      },
      rawMeta: { usageMetadata: json.usageMetadata ?? null },
    };
  }
}
