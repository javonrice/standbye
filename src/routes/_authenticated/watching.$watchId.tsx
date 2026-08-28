import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, BellOff, MoreHorizontal, RefreshCw } from "lucide-react";

import { CueBadge } from "@/components/aircue/CueBadge";
import {
  getPlan,
  getWatchTimeline,
  markChangesSeen,
  refreshWatchPlan,
  stopWatchPlan,
} from "@/lib/aircue/plan.functions";
import { agoLabel, judgmentShort, type Judgment, type StandbyOption } from "@/lib/aircue/standby";

export const Route = createFileRoute("/_authenticated/watching/$watchId")({
  head: () => ({
    meta: [
      { title: "What changed — Standbye" },
      {
        name: "description",
        content:
          "A plain timeline of everything that shifted on your standby decision since you started watching it.",
      },
      { property: "og:title", content: "What changed — Standbye" },
      { property: "og:description", content: "Timeline of meaningful changes on your plan." },
    ],
  }),
  component: WatchTimeline,
});

function clockLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function optionLabel(option: StandbyOption): string {
  if (option.kind === "connection") {
    const via = option.segments[0]?.dest;
    return via ? `Via ${via}` : option.flightLabel;
  }
  return option.flightLabel;
}

function WatchTimeline() {
  const { watchId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const timeline = useServerFn(getWatchTimeline);
  const seen = useServerFn(markChangesSeen);
  const refresh = useServerFn(refreshWatchPlan);
  const stop = useServerFn(stopWatchPlan);
  const planFn = useServerFn(getPlan);

  const [menuOpen, setMenuOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["watch", watchId],
    queryFn: () => timeline({ data: { watchId } }),
  });

  const watch = data?.watch;
  const option = data?.option;

  const { data: plan } = useQuery({
    queryKey: ["plan", watch?.planId],
    queryFn: () => planFn({ data: { planId: watch?.planId as string } }),
    enabled: Boolean(watch?.planId),
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

  const end = useMutation({
    mutationFn: () => stop({ data: { watchId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watches"] });
      void navigate({ to: "/watching" });
    },
  });

  const unseen = watch?.unseenChanges ?? 0;
  useEffect(() => {
    if (unseen > 0) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen]);

  const preferred = plan?.options?.[0];
  const showsPreferred = Boolean(preferred && watch && preferred.id !== watch.optionId);

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-2xl md:px-10 md:pt-12">
      <div className="flex items-center justify-between">
        <Link to="/watching" className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Watching
        </Link>
        <div className="relative">
          <button
            type="button"
            aria-label="Watch options"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  recheck.mutate();
                }}
                disabled={recheck.isPending}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
              >
                <RefreshCw className="h-4 w-4" />
                {recheck.isPending ? "Rechecking…" : "Recheck now"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  end.mutate();
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
              >
                <BellOff className="h-4 w-4" /> Stop watching
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading the timeline…</p>}

      {watch && (
        <header className="mt-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {watch.origin} → {watch.dest}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {watch.flightLabel} · {watch.travelDate} · {watch.depLocal} local
          </p>
          <div className="mt-3 flex items-center gap-2">
            <CueBadge judgment={watch.judgment as Judgment} size="sm" short />
            <Link
              to="/options/$optionId"
              params={{ optionId: watch.optionId }}
              className="flex items-center gap-1 text-sm font-semibold text-primary"
            >
              Open the cue <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>
      )}

      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        What changed about your decision
      </h2>

      <ol className="mt-3">
        {watch && (
          <li className="relative flex gap-3 pb-5">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="mt-1 w-px flex-1 bg-border" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Now
              </p>
              <p className="mt-1 font-display text-base font-semibold">
                Setup reads {judgmentShort[watch.judgment as Judgment]}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{watch.verdict}</p>
              {option && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Last full read {agoLabel(option.refreshedAt)}.
                </p>
              )}
            </div>
          </li>
        )}

        {(data?.changes ?? []).map((c, i, arr) => (
          <li key={c.id} className="relative flex gap-3 pb-5">
            <div className="flex flex-col items-center">
              <span className="mt-1.5 h-2.5 w-2.5 rounded-full border border-border bg-card" />
              {i < arr.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {clockLabel(c.occurredAt)}
              </p>
              <p className="mt-1 text-sm font-semibold">{c.headline}</p>
              {c.detail && <p className="mt-0.5 text-sm text-muted-foreground">{c.detail}</p>}
            </div>
          </li>
        ))}
      </ol>

      {data && data.changes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nothing meaningful has moved since you started watching. That is good news.
        </p>
      )}

      {showsPreferred && preferred && watch?.planId && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Standbye now prefers
          </p>
          <div className="mt-2 flex items-center gap-2">
            <CueBadge judgment={preferred.judgment} size="sm" short />
            <span className="font-display text-base font-semibold">{optionLabel(preferred)}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{preferred.headline}</p>
          <Link
            to="/plans/$planId/compare"
            params={{ planId: watch.planId }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Compare plans
          </Link>
        </section>
      )}
    </main>
  );
}
