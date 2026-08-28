import { useState } from "react";
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
import { addReportedLoad } from "@/lib/aircue/plan.functions";
import { useOption } from "@/lib/aircue/use-option";

export const Route = createFileRoute("/_authenticated/options/$optionId/load")({
  head: () => ({
    meta: [
      { title: "Add a load — Standbye" },
      {
        name: "description",
        content:
          "Enter the open seats and listed standbys you can see, and Standbye re-reads the whole setup around it.",
      },
      { property: "og:title", content: "Add a load — Standbye" },
      { property: "og:description", content: "Employee-entered loads are the strongest evidence." },
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

  const [openSeats, setOpenSeats] = useState("");
  const [standbys, setStandbys] = useState("");
  const [cabin, setCabin] = useState("economy");
  const [source, setSource] = useState("employee_system");

  const submit = useMutation({
    mutationFn: () =>
      add({
        data: {
          optionId,
          openSeats: openSeats === "" ? null : Number(openSeats),
          standbys: standbys === "" ? null : Number(standbys),
          cabin,
          source,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["option", optionId] });
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
        What you can see in your employee system beats anything Standbye can infer from public data.
        It stays private to your account.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
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
          {submit.isPending ? "Re-reading the setup…" : "Save load and update the cue"}
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
