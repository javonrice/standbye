import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";

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
import { buildSegmentKey } from "@/lib/aircue/option-key";
import { addReportedLoad } from "@/lib/aircue/plan.functions";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/load")({
  head: () => ({
    meta: [
      { title: "Add a load — Standbye" },
      {
        name: "description",
        content:
          "Enter the open seats and listed standbys you can see, and Standbye re-scores your whole plan.",
      },
      { property: "og:title", content: "Add a load — Standbye" },
      { property: "og:description", content: "Employee-entered loads improve the whole plan ranking." },
    ],
  }),
  component: AddLoad,
});

function AddLoad() {
  const { optionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useOption(optionId);
  const add = useServerFn(addReportedLoad);

  const segmentChoices = useMemo(() => {
    const segments = data?.option?.segments ?? [];
    if (segments.length === 0 && data?.option) {
      return [
        {
          key: buildSegmentKey({
            carrier: data.option.carrier,
            flightNumber: data.option.flightNumber,
            origin: data.option.origin,
            dest: data.option.dest,
            schedDepUtc: data.option.schedDepUtc,
            depLocal: data.option.depLocal,
          }),
          label: data.option.flightLabel,
        },
      ];
    }
    return segments.map((segment) => ({
      key: buildSegmentKey({
        carrier: segment.carrier,
        flightNumber: segment.flightNumber,
        origin: segment.origin,
        dest: segment.dest,
        schedDepUtc: segment.schedDepUtc,
        depLocal: segment.depLocal,
      }),
      label: `${segment.flightLabel} · ${segment.origin} → ${segment.dest}`,
    }));
  }, [data?.option]);

  const [segmentKey, setSegmentKey] = useState("");
  const [openSeats, setOpenSeats] = useState("");
  const [standbys, setStandbys] = useState("");
  const [cabin, setCabin] = useState("economy");
  const [source, setSource] = useState("employee_system");
  const [partyIncluded, setPartyIncluded] = useState("unsure");

  const activeSegmentKey = segmentKey || segmentChoices[0]?.key || "";

  const submit = useMutation({
    mutationFn: () =>
      add({
        data: {
          optionId,
          ...(segmentChoices.length > 1 ? { segmentKey: activeSegmentKey } : {}),
          openSeats: openSeats === "" ? null : Number(openSeats),
          standbys: standbys === "" ? null : Number(standbys),
          cabin,
          source,
          partyIncluded: partyIncluded as "yes" | "no" | "unsure",
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["option", optionId] });
      if (result.planId) {
        await queryClient.invalidateQueries({ queryKey: ["plan", result.planId] });
        await queryClient.invalidateQueries({ queryKey: ["plans"] });
      }
      if (result.bestOptionChanged && result.planId) {
        navigate({ to: "/plans/$planId", params: { planId: result.planId } });
        return;
      }
      navigate({ to: "/options/$optionId", params: { optionId } });
    },
  });

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-xl md:px-10 md:pt-12">
      <Link
        to="/options/$optionId"
        params={{ optionId }}
        className="flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the cue
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Add a real load</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {data?.option
          ? `${data.option.flightLabel} · ${data.option.origin} → ${data.option.dest}`
          : "Loading…"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Standbye uses what you know to improve the whole plan — not just this flight&apos;s card.
        Party listing stays private. Normalized open/listed numbers may help other travelers when
        your home airline matches this flight.
      </p>
      {data?.option?.planId && (
        <p className="mt-2 text-sm">
          <Link
            to="/plans/$planId/loads"
            params={{ planId: data.option.planId }}
            className="font-medium text-primary"
          >
            Add loads for the whole plan →
          </Link>
        </p>
      )}

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        {segmentChoices.length > 1 && (
          <div>
            <Label>Which flight segment?</Label>
            <Select value={activeSegmentKey} onValueChange={setSegmentKey}>
              <SelectTrigger className="mt-1.5 h-12">
                <SelectValue placeholder="Choose segment" />
              </SelectTrigger>
              <SelectContent>
                {segmentChoices.map((choice) => (
                  <SelectItem key={choice.key} value={choice.key}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="open">Open seats</Label>
            <Input
              id="open"
              type="number"
              min={0}
              max={400}
              inputMode="numeric"
              value={openSeats}
              onChange={(e) => setOpenSeats(e.target.value)}
              className="mt-1.5 h-12"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="standbys">Listed standbys</Label>
            <Input
              id="standbys"
              type="number"
              min={0}
              max={400}
              inputMode="numeric"
              value={standbys}
              onChange={(e) => setStandbys(e.target.value)}
              className="mt-1.5 h-12"
            />
          </div>
        </div>

        <div>
          <Label>Are your travelers already included in that standby count?</Label>
          <Select value={partyIncluded} onValueChange={setPartyIncluded}>
            <SelectTrigger className="mt-1.5 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes, we&apos;re already listed</SelectItem>
              <SelectItem value="no">No, we&apos;re not listed yet</SelectItem>
              <SelectItem value="unsure">Not sure</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            If you&apos;re not listed yet, Standbye counts your party size against the open seats.
          </p>
        </div>

        <div>
          <Label>Cabin</Label>
          <Select value={cabin} onValueChange={setCabin}>
            <SelectTrigger className="mt-1.5 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="economy">Economy</SelectItem>
              <SelectItem value="premium">Premium economy</SelectItem>
              <SelectItem value="business">Business or first</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Where did this come from?</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="mt-1.5 h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="employee_system">My employee system</SelectItem>
              <SelectItem value="stafftraveler">StaffTraveler</SelectItem>
              <SelectItem value="coworker">A friend or coworker</SelectItem>
              <SelectItem value="other">Somewhere else</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" className="h-12 w-full" disabled={submit.isPending}>
          {submit.isPending ? "Updating your plan…" : "Save load and update the plan"}
        </Button>

        {submit.isError && (
          <p className="text-sm text-rough-foreground">
            That did not save. Check the numbers and try again.
          </p>
        )}
      </form>
    </main>
  );
}
