/**
 * Factory for LoadScreenshotParser.
 * LOAD_SCREENSHOT_PROVIDER = gateway | gemini_flash | lovable | mock
 * Default: gateway (Lovable AI Gateway, cheapest vision model).
 */
import type { LoadScreenshotParser } from "@/lib/aircue/load-screenshot/types";
import { GatewayLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/gateway";
import { GeminiFlashLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/gemini-flash";
import { LovableLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/lovable";
import { MockLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/mock";

export type LoadScreenshotProviderId = "gateway" | "gemini_flash" | "lovable" | "mock";

export function resolveLoadScreenshotProviderId(
  raw = process.env["LOAD_SCREENSHOT_PROVIDER"],
): LoadScreenshotProviderId {
  const v = (raw ?? "gateway").trim().toLowerCase();
  if (v === "lovable" || v === "mock" || v === "gemini_flash" || v === "gateway") return v;
  return "gateway";
}

export function getLoadScreenshotParser(): LoadScreenshotParser {
  const id = resolveLoadScreenshotProviderId();
  if (id === "mock") return new MockLoadScreenshotParser();

  if (id === "lovable") {
    const url = process.env["LOVABLE_VISION_URL"]?.trim();
    const key = process.env["LOVABLE_VISION_API_KEY"]?.trim();
    if (!url || !key) {
      throw new Error(
        "LOAD_SCREENSHOT_PROVIDER=lovable requires LOVABLE_VISION_URL and LOVABLE_VISION_API_KEY",
      );
    }
    return new LovableLoadScreenshotParser(url, key);
  }

  if (id === "gemini_flash") {
    const geminiKey = process.env["GEMINI_API_KEY"]?.trim();
    if (!geminiKey) {
      throw new Error("LOAD_SCREENSHOT_PROVIDER=gemini_flash requires GEMINI_API_KEY");
    }
    return new GeminiFlashLoadScreenshotParser(geminiKey);
  }

  const gatewayKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!gatewayKey) {
    throw new Error("Load screenshot parsing requires LOVABLE_API_KEY");
  }
  return new GatewayLoadScreenshotParser(gatewayKey);
}

export function isLoadScreenshotParsingConfigured(): boolean {
  const id = resolveLoadScreenshotProviderId();
  if (id === "mock") return true;
  if (id === "lovable") {
    return Boolean(
      process.env["LOVABLE_VISION_URL"]?.trim() && process.env["LOVABLE_VISION_API_KEY"]?.trim(),
    );
  }
  if (id === "gemini_flash") return Boolean(process.env["GEMINI_API_KEY"]?.trim());
  return Boolean(process.env["LOVABLE_API_KEY"]?.trim());
}

