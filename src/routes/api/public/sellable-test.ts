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
        return Response.json({ tripId, result });
      },
    },
  },
});
