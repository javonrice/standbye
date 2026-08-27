import { createFileRoute } from "@tanstack/react-router";
import { SearchingOverlay } from "@/components/aircue/SearchingOverlay";

export const Route = createFileRoute("/test-overlay")({
  component: () => (
    <SearchingOverlay
      phase="building"
      flightLabel="UA1448"
      origin="ORD"
      dest="IAH"
    />
  ),
});
