import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, Search } from "lucide-react";

import { AirportField } from "@/components/aircue/AirportField";
import { AppShell } from "@/components/aircue/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AIRLINES, ALL_AIRLINES } from "@/lib/aircue/airlines";
import { createBrief } from "@/lib/aircue/brief.functions";
import { getDeviceId } from "@/lib/aircue/device";
import {
  searchRouteSellable,
  type RouteBoardResponse,
  type RouteBoardRow,
} from "@/lib/aircue/routes.functions";

export const Route = createFileRoute("/routes")({
  head: () => ({
    meta: [
      { title: "Route day board — Aircue" },
      {
        name: "description",
        content:
          "Pick an origin, destination, and date to see the nonstop flights still selling seats in the public booking search, in coarse Aircue buckets.",
      },
      { property: "og:title", content: "Route day board — Aircue" },
      {
        property: "og:description",
        content: "Nonstops on your route with Aircue sellable-seat buckets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RouteBoardScreen,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** "4:14 PM" -> "16:14" so the brief pipeline can anchor the leg. */
function to24h(label: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})\s?(AM|PM)$/i.exec(label.trim());
  if (!match) return undefined;
  let hour = Number(match[1]) % 12;
  if (match[3]!.toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function BucketBadge({ row }: { row: RouteBoardRow }) {
  if (row.bucket === "0") {
    return (
      <span className="rounded-full bg-rough/15 px-2.5 py-1 text-xs font-semibold text-rough">
        None in public search
      </span>
    );
  }
  if (row.bucket === "9+") {
    return (
      <span className="rounded-full bg-clear/15 px-2.5 py-1 text-xs font-semibold text-clear">
        9+
      </span>
    );
  }
  return (
    <span className="rounded-full bg-watch/15 px-2.5 py-1 text-xs font-semibold text-watch">
      {row.largestN ? `~${row.largestN}` : "Under 9"}
    </span>
  );
}

function RouteBoardScreen() {
  const navigate = useNavigate();
  const board = useServerFn(searchRouteSellable);
  const create = useServerFn(createBrief);

  const [deviceId, setDeviceId] = useState("");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [travelDate, setTravelDate] = useState(todayISO());
  const [airline, setAirline] = useState(ALL_AIRLINES);
  const [result, setResult] = useState<RouteBoardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingLabel, setOpeningLabel] = useState<string | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const search = useMutation({
    mutationFn: () =>
      board({
        data: {
          origin,
          dest,
          travelDate,
          ...(airline !== ALL_AIRLINES ? { airline } : {}),
          deviceId,
          mode: "quick" as const,
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      if (!data.ok) {
        setError(
          data.reason === "empty"
            ? "No nonstops on that route and date are selling in the public search."
            : "We couldn't run the check just now. Try again in a moment.",
        );
      }
    },
    onError: () => setError("We couldn't run the check just now. Try again in a moment."),
  });

  const open = useMutation({
    mutationFn: (row: RouteBoardRow) =>
      create({
        data: {
          travelDate,
          origin,
          dest,
          airline: row.airlineCode,
          flightNumber: row.flightNumber,
          ...(to24h(row.depLocal) ? { depTime: to24h(row.depLocal)! } : {}),
          deviceId,
        },
      }),
    onSuccess: ({ tripId }) =>
      navigate({ to: "/brief/$briefId", params: { briefId: tripId } }),
    onError: () => {
      setOpeningLabel(null);
      setError("We couldn't build that brief. Try again.");
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Route day board</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Nonstops on your route with Aircue sellable-seat buckets from the public booking
          search.
        </p>

        <form
          className="mt-5 rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setResult(null);
            search.mutate();
          }}
        >
          <div className="flex gap-3">
            <AirportField id="board-origin" label="From" value={origin} onChange={setOrigin} />
            <AirportField
              id="board-dest"
              label="To"
              value={dest}
              placeholder="ATL"
              onChange={setDest}
            />
          </div>

          <div className="mt-3 flex gap-3">
            <div className="flex-1">
              <Label htmlFor="board-date" className="text-xs text-muted-foreground">
                Date
              </Label>
              <Input
                id="board-date"
                type="date"
                required
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                className="mt-1.5 h-12 bg-surface text-base"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="board-airline" className="text-xs text-muted-foreground">
                Airline
              </Label>
              <Select value={airline} onValueChange={setAirline}>
                <SelectTrigger id="board-airline" className="mt-1.5 h-12 bg-surface text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AIRLINES.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={search.isPending}
            className="mt-4 h-12 w-full text-sm font-semibold"
          >
            {search.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Checking public inventory
              </>
            ) : (
              <>
                <Search className="h-4 w-4" /> Check sellable seats
              </>
            )}
          </Button>
        </form>

        {search.isPending && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Checking public inventory… usually under 10 seconds.
          </p>
        )}

        {error && !search.isPending && <p className="mt-4 text-sm text-rough">{error}</p>}

        {result?.ok && result.flights.length > 0 && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">
                {origin} → {dest} · {result.flights.length} nonstops
              </h2>
              {result.fromCache && (
                <span className="text-xs text-muted-foreground">Cached result</span>
              )}
            </div>

            <ul className="mt-3 space-y-2">
              {result.flights.map((row) => (
                <li key={row.flightLabel}>
                  <button
                    type="button"
                    disabled={open.isPending}
                    onClick={() => {
                      setError(null);
                      setOpeningLabel(row.flightLabel);
                      open.mutate(row);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-surface disabled:opacity-70"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {row.airlineCode} {row.flightNumber} · {row.airlineName}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {row.depLocal || "—"}
                        {row.arrLocal ? ` → ${row.arrLocal}` : ""} local
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <BucketBadge row={row} />
                      {openingLabel === row.flightLabel && open.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Aircue checks public booking inventory in coarse buckets. It is not airline load data,
          standby priority, or a prediction you will get on.
        </p>
      </div>
    </AppShell>
  );
}
