import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plane, User } from "lucide-react";

import earth from "@/assets/home-earth.jpg";
import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import { BottomNav } from "@/components/aircue/BottomNav";
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
import { createBrief, resolveFlight, searchAirports } from "@/lib/aircue/brief.functions";
import { AIRLINES, ALL_AIRLINES } from "@/lib/aircue/airlines";
import { getDeviceId } from "@/lib/aircue/device";
import { searchDisclaimer } from "@/lib/aircue/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Aircue — Check standby pressure on your flight" },
      {
        name: "description",
        content:
          "Enter your flight number, date, and route. Aircue checks live FAA, aviation weather, and event conditions that could make a standby attempt harder.",
      },
      { property: "og:title", content: "Aircue — Check standby pressure on your flight" },
      {
        property: "og:description",
        content: "Live FAA, weather, and event conditions around your standby flight.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchScreen,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function AirportField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const search = useServerFn(searchAirports);
  const { data: options } = useQuery({
    queryKey: ["airports", value],
    queryFn: () => search({ data: { q: value } }),
    enabled: value.length >= 2,
  });

  return (
    <div className="flex-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        list={`${id}-options`}
        required
        maxLength={3}
        autoCapitalize="characters"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="DEN"
        className="mt-1.5 h-12 bg-surface text-base uppercase"
      />
      <datalist id={`${id}-options`}>
        {(options ?? []).map((a) => (
          <option key={a.iata} value={a.iata}>
            {a.city ?? a.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function SearchScreen() {
  const navigate = useNavigate();
  const create = useServerFn(createBrief);
  const resolve = useServerFn(resolveFlight);
  const [deviceId, setDeviceId] = useState("");
  const [tripName, setTripName] = useState("");
  const [travelDate, setTravelDate] = useState(todayISO());
  const [flightNumber, setFlightNumber] = useState("");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [depTime, setDepTime] = useState("");
  const [airline, setAirline] = useState("UA");
  const [manual, setManual] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!manual && flightNumber) {
        const found = await resolve({
          data: { airline, flightNumber, travelDate, deviceId },
        });
        if (found.ok && found.origin && found.dest) {
          return create({
            data: {
              tripName,
              travelDate,
              origin: found.origin,
              dest: found.dest,
              airline,
              flightNumber,
              schedDepUtc: found.schedDepUtc ?? "",
              schedArrUtc: found.schedArrUtc ?? "",
              deviceId,
            },
          });
        }
        setManual(true);
        setNotice(
          found.reason === "not_found"
            ? "We couldn’t find that flight for that date — enter your route and we’ll still check conditions."
            : "We couldn’t look that flight up right now — enter your route and we’ll still check conditions.",
        );
        throw new Error("");
      }

      if (!origin || !dest) throw new Error("Enter both airports.");
      return create({
        data: { tripName, travelDate, origin, dest, depTime, deviceId, airline },
      });
    },
    onSuccess: (result) => {
      void navigate({ to: "/brief/$briefId", params: { briefId: result.tripId } });
    },
    onError: (e: Error) => setError(e.message || ""),
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <img
        src={earth}
        alt=""
        aria-hidden
        width={1024}
        height={1536}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background"
      />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 md:ml-[5.5rem] md:max-w-[calc(72rem-5.5rem)] md:px-10 md:pb-12 lg:ml-56">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src={mark.url} alt="" aria-hidden className="h-8 w-8 invert" />
            <img src={wordmark.url} alt="Aircue" className="h-5 w-auto invert" />
          </div>
          <button
            type="button"
            aria-label="Profile"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/60 text-foreground backdrop-blur-md transition-colors hover:bg-card"
          >
            <User className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-auto md:mt-12 md:flex md:flex-1 md:items-center md:gap-12">
        <div className="hidden md:block md:flex-1">
          <p className="font-display text-4xl font-bold leading-tight tracking-tight lg:text-5xl">
            Know what you are walking into
            <br />
            before you list standby.
          </p>
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            Aircue reads live airport, weather, and flight-chain conditions and tells you, in plain
            language, what could make today harder.
          </p>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card/85 p-5 shadow-card backdrop-blur-xl md:w-[26rem] md:shrink-0 md:p-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">Check a flight</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What could make getting on standby harder today.
          </p>

          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setNotice(null);
              mutation.mutate();
            }}
          >
            <div className="flex gap-3">
              <div className="w-[9.5rem]">
                <Label htmlFor="airline" className="text-xs text-muted-foreground">
                  Airline
                </Label>
                <Select value={airline} onValueChange={setAirline}>
                  <SelectTrigger id="airline" className="mt-1.5 h-12 bg-surface text-base">
                    <SelectValue placeholder="Airline" />
                  </SelectTrigger>
                  <SelectContent>
                    {AIRLINES.filter((a) => a.code !== ALL_AIRLINES || manual).map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="flight-number" className="text-xs text-muted-foreground">
                  Flight number
                </Label>
                <Input
                  id="flight-number"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="782"
                  className="mt-1.5 h-12 bg-surface text-base"
                />
              </div>
            </div>

            <div className="mt-3">
              <Label htmlFor="date" className="text-xs text-muted-foreground">
                Travel date
              </Label>
              <Input
                id="date"
                type="date"
                required
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                className="mt-1.5 h-12 bg-surface text-base"
              />
            </div>

            {manual && (
              <>
                <div className="mt-3 flex gap-3">
                  <AirportField id="origin" label="From" value={origin} onChange={setOrigin} />
                  <AirportField id="dest" label="To" value={dest} onChange={setDest} />
                </div>
                <div className="mt-3">
                  <Label htmlFor="time" className="text-xs text-muted-foreground">
                    Departs (optional)
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={depTime}
                    onChange={(e) => setDepTime(e.target.value)}
                    className="mt-1.5 h-12 bg-surface text-base"
                  />
                </div>
              </>
            )}

            <div className="mt-3">
              <Label htmlFor="trip-name" className="text-xs text-muted-foreground">
                Trip name (optional)
              </Label>
              <Input
                id="trip-name"
                value={tripName}
                autoComplete="off"
                maxLength={40}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="Morning to Chicago"
                className="mt-1.5 h-12 bg-surface text-base"
              />
            </div>

            {notice && <p className="mt-3 text-sm text-foreground/85">{notice}</p>}

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="mt-4 h-12 w-full text-sm font-semibold"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking conditions
                </>
              ) : (
                <>
                  <Plane className="h-4 w-4" /> Check standby pressure
                </>
              )}
            </Button>

            {!manual && (
              <button
                type="button"
                onClick={() => setManual(true)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-4"
              >
                Enter route manually
              </button>
            )}
          </form>

          {error && <p className="mt-3 text-sm text-rough">{error}</p>}

          <p className="mt-3 text-center text-[0.7rem] leading-relaxed text-muted-foreground">
            {searchDisclaimer}
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

