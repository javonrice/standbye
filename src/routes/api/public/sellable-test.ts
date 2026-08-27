import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/sellable-test")({
  server: {
    handlers: {
      GET: async () => {
        const { probeSellable } = await import("@/lib/aircue/serpapi-flights.server");
        const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        const date = d.toISOString().slice(0, 10);
        const result = await probeSellable({
          tripId: "00000000-0000-0000-0000-000000000000",
          flightLabel: "UA542",
          carrier: "UA",
          flightNumber: "542",
          origin: "ORD",
          dest: "DEN",
          date,
          schedDepUtc: null,
          deviceId: null,
        });
        return Response.json(result);
      },
    },
  },
});
