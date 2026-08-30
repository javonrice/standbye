/**
 * Factory for LoadScreenshotParser.
 * LOAD_SCREENSHOT_PROVIDER = gemini_flash | lovable | mock
 */
import type { LoadScreenshotParser } from "@/lib/aircue/load-screenshot/types";
import { GeminiFlashLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/gemini-flash";
import { LovableLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/lovable";
import { MockLoadScreenshotParser } from "@/lib/aircue/load-screenshot/providers/mock";

export type LoadScreenshotProviderId = "gemini_flash" | "lovable" | "mock";

export function resolveLoadScreenshotProviderId(
  raw = process.env["LOAD_SCREENSHOT_PROVIDER"],
): LoadScreenshotProviderId {
  const v = (raw ?? "gemini_flash").trim().toLowerCase();
  if (v === "lovable" || v === "mock" || v === "gemini_flash") return v;
  return "gemini_flash";
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

  const geminiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (!geminiKey) {
    throw new Error("LOAD_SCREENSHOT_PROVIDER=gemini_flash requires GEMINI_API_KEY");
  }
  return new GeminiFlashLoadScreenshotParser(geminiKey);
}

export function isLoadScreenshotParsingConfigured(): boolean {
  const id = resolveLoadScreenshotProviderId();
  if (id === "mock") return true;
  if (id === "lovable") {
    return Boolean(
      process.env["LOVABLE_VISION_URL"]?.trim() && process.env["LOVABLE_VISION_API_KEY"]?.trim(),
    );
  }
  return Boolean(process.env["GEMINI_API_KEY"]?.trim());
}
