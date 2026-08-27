import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sellable-test")({
  server: {
    handlers: {
      GET: async () => {
        const { ensureTrip } = await import("@/lib/aircue/pipeline.server");
        const { probeSellable } = await import("@/lib/aircue/serpapi-flights.server");
        const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        const date = d.toISOString().slice(0, 10);
        const tripId = await ensureTrip({
          flightLabel: "UA542 (probe test)",
          travelDate: date,
          origin: "ORD",
          dest: "DEN",
          airline: "UA",
          flightNumber: "542",
        });
        const result = await probeSellable({
          tripId,
          flightLabel: "UA542",
          carrier: "UA",
          flightNumber: "542",
          origin: "ORD",
          dest: "DEN",
          date,
          schedDepUtc: null,
          deviceId: null,
        });
        // Raw sanity check: does SerpAPI return flights for this route/date at all?
        const key = process.env["SERPAPI_API_KEY"]!;
        const url = new URL("https://serpapi.com/search.json");
        url.searchParams.set("engine", "google_flights");
        url.searchParams.set("departure_id", "ORD");
        url.searchParams.set("arrival_id", "DEN");
        url.searchParams.set("outbound_date", date);
        url.searchParams.set("type", "2");
        url.searchParams.set("adults", "1");
        url.searchParams.set("currency", "USD");
        url.searchParams.set("hl", "en");
        url.searchParams.set("api_key", key);
        const res = await fetch(url);
        const raw = (await res.json()) as Record<string, unknown>;
        const flightNos = [
          ...((raw["best_flights"] as unknown[]) ?? []),
          ...((raw["other_flights"] as unknown[]) ?? []),
        ]
          .flatMap((g) => (g as { flights?: { flight_number?: string }[] }).flights ?? [])
          .map((f) => f.flight_number)
          .slice(0, 40);
        return Response.json({
          tripId,
          result,
          rawStatus: res.status,
          rawError: raw["error"] ?? null,
          totalOptions: flightNos.length,
          sampleFlightNumbers: flightNos,
        });
      },
    },
  },
});
