import type {
  LoadScreenshotParser,
  LoadScreenshotParserInput,
  ParseResult,
} from "@/lib/aircue/load-screenshot/types";

/** Deterministic parser for tests — no network. */
export class MockLoadScreenshotParser implements LoadScreenshotParser {
  readonly providerId = "mock";

  constructor(private readonly fixture?: ParseResult) {}

  async parseScreenshot(_input: LoadScreenshotParserInput): Promise<ParseResult> {
    if (this.fixture) return this.fixture;
    return {
      provider: "mock",
      model: "mock-v1",
      confidence: 0.9,
      flights: [
        {
          airline: "UA",
          flightNumber: "123",
          origin: "ORD",
          dest: "LAX",
          date: "2026-09-01",
          depLocal: "10:20 AM",
          cabin: "economy",
          openSeats: 8,
          standbys: 3,
        },
      ],
      usage: { units: 0, costUsdEstimate: 0 },
    };
  }
}
