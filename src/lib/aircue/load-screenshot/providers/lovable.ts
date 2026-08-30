/**
 * Lovable vision drop-in adapter.
 *
 * Configure when ready:
 *   LOAD_SCREENSHOT_PROVIDER=lovable
 *   LOVABLE_VISION_URL=https://…   (POST JSON body below)
 *   LOVABLE_VISION_API_KEY=…
 *
 * Expected response shape matches ParseResult (or { flights, confidence, model? }).
 * Until configured, getLoadScreenshotParser() will throw a clear error.
 */
import type {
  ExtractedFlightLoad,
  LoadScreenshotParser,
  LoadScreenshotParserInput,
  ParseResult,
} from "@/lib/aircue/load-screenshot/types";

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export class LovableLoadScreenshotParser implements LoadScreenshotParser {
  readonly providerId = "lovable";

  constructor(
    private readonly endpointUrl: string,
    private readonly apiKey: string,
  ) {}

  async parseScreenshot(input: LoadScreenshotParserInput): Promise<ParseResult> {
    const res = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        mimeType: input.mimeType,
        imageBase64: bytesToBase64(input.imageBytes),
        airlineHint: input.airlineHint ?? null,
        purpose: "standbye_load_screenshot",
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Lovable vision parse failed (${res.status}): ${errText.slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      provider?: string;
      model?: string;
      confidence?: number;
      flights?: ExtractedFlightLoad[];
      usage?: ParseResult["usage"];
      observedAtGuess?: ParseResult["observedAtGuess"];
    };
    return {
      provider: json.provider ?? this.providerId,
      model: json.model ?? "lovable",
      confidence: typeof json.confidence === "number" ? json.confidence : 0.7,
      flights: Array.isArray(json.flights) ? json.flights : [],
      ...(json.observedAtGuess ? { observedAtGuess: json.observedAtGuess } : {}),
      ...(json.usage ? { usage: json.usage } : {}),
    };
  }
}
