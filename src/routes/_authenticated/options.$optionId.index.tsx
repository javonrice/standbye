import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";

import { OptionBrief } from "@/components/aircue/OptionBrief";
import { Button } from "@/components/ui/button";
import { useOption } from "@/lib/aircue/use-option";
import { setPrimaryOptionFn } from "@/lib/aircue/plan.functions";

export const Route = createFileRoute("/_authenticated/options/$optionId/")({
  head: () => ({
    meta: [
      { title: "Option detail — Standbye" },
      {
        name: "description",
        content:
          "Why this option ranks where it does: the booking check, operating conditions, the backup runway, and any load you added.",
      },
      { property: "og:title", content: "Option detail — Standbye" },
      { property: "og:description", content: "The reasoning behind one standby option." },
    ],
  }),
  component: OptionScreen,
});

function OptionScreen() {
  const { optionId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useOption(optionId);
  const setPrimary = useServerFn(setPrimaryOptionFn);

  const useThisOption = useMutation({
    mutationFn: () => setPrimary({ data: { planId: data!.planId!, optionId } }),
    onSuccess: async () => {
      const planId = data!.planId!;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["option", optionId] }),
        queryClient.invalidateQueries({ queryKey: ["plan", planId] }),
        queryClient.invalidateQueries({ queryKey: ["plans"] }),
      ]);
      void navigate({ to: "/plans/$planId", params: { planId } });
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading this option…</p>;
  }

  if (isError) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="font-display text-lg font-semibold">Could not load this option</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong on our side. Try again in a moment — your plan is still there.
        </p>
        <Button asChild className="mt-4 h-11" variant="outline">
          <Link to="/plan">Back to Home</Link>
        </Button>
      </main>
    );
  }

  const option = data?.option;
  if (!option) {
    return (
      <main className="mx-auto max-w-md px-5 py-10">
        <p className="font-display text-lg font-semibold">That option is gone</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Plans age out as the day moves. Build a fresh one to see current setups.
        </p>
        <Button asChild className="mt-4 h-11">
          <Link to="/plan">Plan another trip</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-muted/40 pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur">
        {data?.planId ? (
          <Link
            to="/plans/$planId"
            params={{ planId: data.planId }}
            aria-label="Back to plan"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        ) : (
          <span className="h-9 w-9" />
        )}
        <p className="flex-1 text-center text-[15px] font-semibold">
          {option.origin} → {option.dest}
        </p>
        <span className="h-9 w-9" />
      </header>

      <OptionBrief option={option} travelDate={data?.travelDate ?? null}>
        {data?.planId ? (
          <div className="mt-6">
            {data.isPrimary ? (
              <p className="flex h-12 items-center justify-center gap-2 text-sm font-semibold text-emerald-600">
                <Check className="h-4 w-4" /> Your current plan
              </p>
            ) : (
              <Button
                className="h-12 w-full"
                disabled={useThisOption.isPending}
                onClick={() => useThisOption.mutate()}
              >
                {useThisOption.isPending ? "Saving…" : "Use this option"}
              </Button>
            )}
          </div>
        ) : null}
      </OptionBrief>
    </main>
  );
}
