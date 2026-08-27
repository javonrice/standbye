import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plane, User } from "lucide-react";

import earth from "@/assets/home-earth.jpg";
import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import { SearchingOverlay, type SearchingPhase } from "@/components/aircue/SearchingOverlay";
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
import {
  createBrief,
  resolveFlight,
  resolveRoute,
  searchAirports,
  type FlightLeg,
} from "@/lib/aircue/brief.functions";


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

/** Airport-local departure time when the provider gives it, else the viewer's clock. */
function legTime(leg: FlightLeg): string {
  if (leg.depLocalTime) {
    const [h, m] = leg.depLocalTime.split(":").map(Number);
    const hour12 = (h ?? 0) % 12 || 12;
    return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"} local`;
  }
  return new Date(leg.schedDepUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function SearchScreen() {
  const navigate = useNavigate();
  const create = useServerFn(createBrief);
  const resolve = useServerFn(resolveFlight);
  const resolveRouteFn = useServerFn(resolveRoute);

  const [deviceId, setDeviceId] = useState("");
  const [tripName, setTripName] = useState("");
  const [travelDate, setTravelDate] = useState(todayISO());
  const [flightNumber, setFlightNumber] = useState("");
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [depTime, setDepTime] = useState("");
  const [airline, setAirline] = useState("UA");
  const [manual, setManual] = useState(false);
  const [legs, setLegs] = useState<FlightLeg[]>([]);
  const [selectedLeg, setSelectedLeg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<SearchingPhase | null>(null);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  const briefFromLeg = (leg: FlightLeg) =>
    create({
      data: {
        tripName,
        travelDate,
        origin: leg.origin,
        dest: leg.dest,
        airline: leg.airlineCode ?? airline,
        flightNumber: leg.flightNumber ?? flightNumber,
        schedDepUtc: leg.schedDepUtc,
        schedArrUtc: leg.schedArrUtc,
        deviceId,
      },
    });

  const legMutation = useMutation({
    mutationFn: (leg: FlightLeg) => {
      setPhase("building");
      return briefFromLeg(leg);
    },
    onSuccess: async (result) => {
      // Keep the searching screen up until the brief page has its data.
      await navigate({ to: "/brief/$briefId", params: { briefId: result.tripId } });
    },
    onError: (e: Error) => {
      setPhase(null);
      setError(e.message || "");
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!manual && flightNumber) {
        const found = await resolve({
          data: { airline, flightNumber, travelDate, deviceId },
        });
        if (found.ok && found.legs && found.legs.length > 0) {
          // A number like UA1448 can fly several legs that day — let the traveller pick.
          if (found.legs.length > 1) {
            setLegs(found.legs);
            throw new Error("");
          }
          setPhase("building");
          return briefFromLeg(found.legs[0]!);
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

      // No flight number: show the flights that actually fly this route that day.
      if (!flightNumber) {
        const found = await resolveRouteFn({
          data: {
            origin,
            dest,
            travelDate,
            airline,
            ...(depTime ? { depTime } : {}),
          },
        });
        if (found.ok && found.legs && found.legs.length > 0) {
          if (found.legs.length > 1) {
            setLegs(found.legs);
            throw new Error("");
          }
          setPhase("building");
          return briefFromLeg(found.legs[0]!);
        }
        setNotice(
          found.reason === "not_found"
            ? "We couldn’t find scheduled flights on that route — we’ll still check conditions for the route."
            : "We couldn’t pull the flight list right now — we’ll still check conditions for the route.",
        );
      }

      setPhase("building");
      return create({
        data: { tripName, travelDate, origin, dest, depTime, deviceId, airline },
      });
    },

    onSuccess: async (result) => {
      await navigate({ to: "/brief/$briefId", params: { briefId: result.tripId } });
    },
    onError: (e: Error) => {
      setPhase(null);
      setError(e.message || "");
    },
  });

  const chosenLeg = legs.find((l) => `${l.origin}-${l.schedDepUtc}` === selectedLeg);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {phase && (
        <SearchingOverlay
          phase={phase}
          flightLabel={!manual && flightNumber ? `${airline}${flightNumber}` : undefined}
          origin={chosenLeg?.origin ?? (manual ? origin.toUpperCase() : undefined)}
          dest={chosenLeg?.dest ?? (manual ? dest.toUpperCase() : undefined)}
        />
      )}

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

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-4 pb-12 pt-6 md:max-w-[calc(72rem-5.5rem)] md:px-10">
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
              Aircue reads live airport, weather, and flight-chain conditions and tells you, in
              plain language, what could make today harder.
            </p>
          </div>

          <div className="md:w-[26rem] md:shrink-0">
            <div className="rounded-3xl border border-border/60 bg-card/85 p-5 shadow-card backdrop-blur-xl md:p-6">
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
                  setLegs([]);

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

                {legs.length > 0 && (
                  <div className="mt-4 rounded-2xl border border-border/60 bg-surface/60 p-3">
                    <p className="text-sm font-semibold">
                      {flightNumber
                        ? `${airline}${flightNumber} flies more than one leg that day`
                        : `Flights from ${origin.toUpperCase()} to ${dest.toUpperCase()} that day`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick the one you are listing for.
                    </p>
                    <div className="mt-3 space-y-2">
                      {legs.map((leg) => {
                        const legKey = `${leg.airlineCode ?? ""}${leg.flightNumber ?? ""}-${leg.origin}-${leg.schedDepUtc}`;
                        const isSelected = selectedLeg === legKey;

                        return (
                          <button
                            key={legKey}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={legMutation.isPending}
                            onClick={() => {
                              setError(null);
                              setSelectedLeg(legKey);
                              legMutation.mutate(leg);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-all ${
                              isSelected
                                ? "border-primary bg-primary/15 ring-1 ring-primary/50"
                                : "border-transparent bg-card/80 hover:bg-card"
                            } disabled:opacity-100`}
                          >
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span
                                aria-hidden
                                className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                  isSelected ? "border-primary bg-primary" : "border-border"
                                }`}
                              >
                                {isSelected && (
                                  <Check className="h-3 w-3 text-primary-foreground" />
                                )}
                              </span>
                              {leg.origin} → {leg.dest}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Departs {legTime(leg)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
        </div>
      </div>
    </div>
  );
}
