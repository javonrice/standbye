import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

import { JudgmentPill } from "@/components/aircue/JudgmentPill";
import {
  getWatchTimeline,
  markChangesSeen,
  refreshWatchPlan,
} from "@/lib/aircue/plan.functions";
import { agoLabel, type Judgment } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/watching/$watchId")({
  head: () => ({
    meta: [
      { title: "What changed — AirCue" },
      {
        name: "description",
        content:
          "A plain timeline of everything that shifted on this standby setup since you started watching it.",
      },
      { property: "og:title", content: "What changed — AirCue" },
      { property: "og:description", content: "Timeline of meaningful changes on your plan." },
    ],
  }),
  component: WatchTimeline,
});

function WatchTimeline() {
  const { watchId } = Route.useParams();
  const queryClient = useQueryClient();
  const timeline = useServerFn(getWatchTimeline);
  const seen = useServerFn(markChangesSeen);
  const refresh = useServerFn(refreshWatchPlan);

  const { data, isLoading } = useQuery({
    queryKey: ["watch", watchId],
    queryFn: () => timeline({ data: { watchId } }),
  });

  const markSeen = useMutation({
    mutationFn: () => seen({ data: { watchId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watches"] }),
  });

  const recheck = useMutation({
    mutationFn: () => refresh({ data: { watchId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch", watchId] });
      queryClient.invalidateQueries({ queryKey: ["watches"] });
    },
  });

  const unseen = data?.watch?.unseenChanges ?? 0;
  useEffect(() => {
    if (unseen > 0) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen]);

  const watch = data?.watch;
  const option = data?.option;

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <Link to="/watching" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to watching
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">What changed</h1>

      {isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading the timeline…</p>}

      {watch && (
        <>
          <div className="mt-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-base font-semibold">
                  {watch.flightLabel} · {watch.origin} → {watch.dest}
                </p>
                <p className="text-xs text-muted-foreground">
                  {watch.travelDate} · {watch.depLocal} local
                </p>
              </div>
              <JudgmentPill judgment={watch.judgment as Judgment} size="sm" />
            </div>
            <p className="mt-2 text-sm text-foreground/85">{watch.verdict}</p>
            <div className="mt-3 flex items-center justify-between">
              <Link
                to="/options/$optionId"
                params={{ optionId: watch.optionId }}
                className="flex items-center gap-1 text-sm font-semibold text-primary"
              >
                Open the cue <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => recheck.mutate()}
                disabled={recheck.isPending}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                {recheck.isPending ? "Rechecking…" : "Recheck now"}
              </button>
            </div>
          </div>

          {option && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last full read {agoLabel(option.refreshedAt)}.
            </p>
          )}
        </>
      )}

      <h2 className="mt-7 font-display text-base font-bold tracking-tight">Timeline</h2>

      {data && data.changes.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing meaningful has moved since you started watching. That is good news.
        </p>
      )}

      <ol className="mt-3 space-y-3">
        {(data?.changes ?? []).map((c) => (
          <li key={c.id} className="relative rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{c.headline}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {agoLabel(c.occurredAt)}
              </span>
            </div>
            {c.detail && <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>}
          </li>
        ))}
      </ol>
    </main>
  );
}
