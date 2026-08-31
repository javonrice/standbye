import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Camera, Keyboard, Plus, Trash2 } from "lucide-react";

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
import {
  addPlanManualLoads,
  getPlan,
  loadScreenshotStatus,
  uploadPlanLoadScreenshots,
} from "@/lib/aircue/plan.functions";
import type { StandbyPlan } from "@/lib/aircue/standby";

type Mode = "chooser" | "screenshot" | "manual";

type ManualRow = {
  id: string;
  segmentKey: string;
  openSeats: string;
  standbys: string;
  cabin: string;
};

type Payoff = {
  headline: string;
  moves: string[];
  note: string | null;
};

function newRow(segmentKey = ""): ManualRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    segmentKey,
    openSeats: "",
    standbys: "",
    cabin: "economy",
  };
}

function rankSnapshot(plan: StandbyPlan | null | undefined) {
  const ranks = new Map<string, { rank: number; label: string }>();
  (plan?.options ?? []).forEach((option, index) => {
    ranks.set(option.id, { rank: index + 1, label: option.flightLabel });
  });
  return ranks;
}

/**
 * One shared add-load task: pick a method, add the numbers, see what it did to
 * the plan. Used by both the plan-level and option-level load routes.
 */
export function LoadTask({
  planId,
  focusSegmentKey,
  backTo,
}: {
  planId: string;
  focusSegmentKey?: string | undefined;
  backTo: { label: string; node: React.ReactNode };
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loadPlan = useServerFn(getPlan);
  const manualFn = useServerFn(addPlanManualLoads);
  const screenshotFn = useServerFn(uploadPlanLoadScreenshots);
  const statusFn = useServerFn(loadScreenshotStatus);

  const { data: plan } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => loadPlan({ data: { planId } }),
  });
  const { data: shotStatus } = useQuery({
    queryKey: ["load-screenshot-status"],
    queryFn: () => statusFn(),
  });

  const [mode, setMode] = useState<Mode>("chooser");
  const [partyIncluded, setPartyIncluded] = useState("unsure");
  const [files, setFiles] = useState<File[]>([]);
  const [confirmRecent, setConfirmRecent] = useState(false);
  const [rows, setRows] = useState<ManualRow[]>([newRow(focusSegmentKey ?? "")]);
  const [formError, setFormError] = useState<string | null>(null);
  const [uncertainNote, setUncertainNote] = useState<string | null>(null);
  const [payoff, setPayoff] = useState<Payoff | null>(null);

  const segmentChoices = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ key: string; label: string }> = [];
    for (const option of plan?.options ?? []) {
      for (const segment of option.segments ?? []) {
        const key = buildSegmentKey(segment);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          label: `${segment.flightLabel} · ${segment.origin} → ${segment.dest}`,
        });
      }
    }
    return out;
  }, [plan?.options]);

  /** Re-read the plan and describe what moved, in plan language. */
  const applyAndCompare = async (accepted: number, uncertain: number) => {
    const before = rankSnapshot(plan);
    await queryClient.invalidateQueries({ queryKey: ["plan", planId] });
    await queryClient.invalidateQueries({ queryKey: ["plans"] });
    const after = rankSnapshot(
      await queryClient.fetchQuery({
        queryKey: ["plan", planId],
        queryFn: () => loadPlan({ data: { planId } }),
      }),
    );

    const moves: string[] = [];
    for (const [optionId, now] of after) {
      const was = before.get(optionId);
      if (was && was.rank !== now.rank) {
        moves.push(`${now.label} moved from #${was.rank} → #${now.rank}`);
      }
    }

    setPayoff({
      headline:
        accepted > 0
          ? `Plan updated · ${accepted} flight${accepted === 1 ? "" : "s"} scored with your numbers`
          : "Nothing applied yet",
      moves: moves.slice(0, 3),
      note:
        uncertain > 0
          ? `${uncertain} row${uncertain === 1 ? "" : "s"} still need a matching flight on this plan.`
          : null,
    });
  };

  const manualSubmit = useMutation({
    mutationFn: () =>
      manualFn({
        data: {
          planId,
          partyIncluded: partyIncluded as "yes" | "no" | "unsure",
          rows: rows
            .filter((r) => r.segmentKey)
            .map((r) => ({
              segmentKey: r.segmentKey,
              openSeats: r.openSeats === "" ? null : Number(r.openSeats),
              standbys: r.standbys === "" ? null : Number(r.standbys),
              cabin: r.cabin,
            })),
        },
      }),
    onSuccess: async (result) => {
      if (result.error) {
        setFormError(result.error);
        return;
      }
      await applyAndCompare(result.accepted.length, result.uncertain.length);
    },
    onError: () => setFormError("That did not save. Check the numbers and try again."),
  });

  const screenshotSubmit = useMutation({
    mutationFn: async () => {
      const images = await Promise.all(
        files.slice(0, 3).map(async (file) => {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
          return {
            mimeType: file.type || "image/jpeg",
            base64: btoa(binary),
            fileLastModifiedMs: file.lastModified || null,
          };
        }),
      );
      return screenshotFn({
        data: {
          planId,
          images,
          partyIncluded: partyIncluded as "yes" | "no" | "unsure",
          confirmedObservedAt: confirmRecent ? new Date().toISOString() : null,
        },
      });
    },
    onSuccess: async (result) => {
      if (result.error) {
        setFormError(result.error);
        return;
      }
      if (result.askRecentConfirm && !confirmRecent) {
        setFormError(
          "This screenshot may be older than it looks. Confirm it was checked recently, then upload again.",
        );
        setConfirmRecent(true);
        return;
      }
      if (result.accepted.length === 0 && result.uncertain.length > 0) {
        setFormError(null);
        setUncertainNote("We could not match those flights. Enter the numbers manually.");
        setMode("manual");
        return;
      }
      await applyAndCompare(result.accepted.length, result.uncertain.length);
    },
    onError: () => setFormError("Screenshot upload failed. Try again or enter loads manually."),
  });

  if (payoff) {
    return (
      <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-xl md:px-10 md:pt-12">
        <h1 className="font-display text-2xl font-bold tracking-tight">{payoff.headline}</h1>
        {payoff.moves.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {payoff.moves.map((m) => (
              <li
                key={m}
                className="rounded-2xl border border-border bg-card px-4 py-3 text-[15px] font-medium"
              >
                {m}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] text-muted-foreground">
            Your order did not change — the numbers backed up what Standbye already thought.
          </p>
        )}
        {payoff.note && <p className="mt-3 text-sm text-muted-foreground">{payoff.note}</p>}

        <Button
          className="mt-7 h-12 w-full"
          onClick={() => navigate({ to: "/plans/$planId", params: { planId } })}
        >
          Back to plan
        </Button>
        <Button
          variant="outline"
          className="mt-3 h-11 w-full"
          onClick={() => {
            setPayoff(null);
            setFormError(null);
            setUncertainNote(null);
            setFiles([]);
            setRows([newRow(focusSegmentKey ?? "")]);
            setMode("chooser");
          }}
        >
          Add another load
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-14 pt-8 md:max-w-xl md:px-10 md:pt-12">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> {backTo.node}
      </span>

      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">Add a load</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {plan ? `${plan.origin} → ${plan.dest} · ${plan.travelDate}` : "Loading…"}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Real numbers re-score the whole plan. Normalized flight information may help other Standbye
        travelers. Personal details are never shared.
      </p>

      {mode === "chooser" && (
        <div className="mt-6 grid gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            How do you want to add it?
          </p>
          <button
            type="button"
            className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-card transition hover:border-primary/40"
            onClick={() => setMode("screenshot")}
          >
            <Camera className="mt-0.5 h-5 w-5 text-primary" />
            <span>
              <span className="block font-semibold">Upload screenshot</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Employee load board photo — we read open seats and listed standbys.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-card transition hover:border-primary/40"
            onClick={() => {
              setMode("manual");
              if (segmentChoices[0] && rows.length === 1 && !rows[0]!.segmentKey) {
                setRows([newRow(segmentChoices[0]!.key)]);
              }
            }}
          >
            <Keyboard className="mt-0.5 h-5 w-5 text-primary" />
            <span>
              <span className="block font-semibold">Type the numbers</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                Add one or more flights from this plan in a single save.
              </span>
            </span>
          </button>
        </div>
      )}

      {mode === "screenshot" && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            screenshotSubmit.mutate();
          }}
        >
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setMode("chooser")}
          >
            ← Choose another way
          </button>

          {!shotStatus?.configured && (
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Screenshot parsing is not configured on this environment yet. You can still enter
              loads manually.
            </p>
          )}

          <div>
            <Label htmlFor="shots">Screenshots (up to 3)</Label>
            <Input
              id="shots"
              type="file"
              accept="image/*"
              multiple
              className="mt-1.5"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
            />
            {files.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {files.length} file{files.length === 1 ? "" : "s"} ready
              </p>
            )}
          </div>

          <PartyField value={partyIncluded} onChange={setPartyIncluded} />

          {confirmRecent && (
            <label className="flex items-start gap-2 rounded-xl border border-border px-3 py-3 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmRecent} readOnly />
              <span>
                Confirm and re-upload: I checked this load recently — Standbye will use now as the
                observation time.
              </span>
            </label>
          )}

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={screenshotSubmit.isPending || files.length === 0 || !shotStatus?.configured}
          >
            {screenshotSubmit.isPending ? "Reading screenshot…" : "Upload and update plan"}
          </Button>
        </form>
      )}

      {mode === "manual" && (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            if (rows.every((r) => !r.segmentKey)) {
              setFormError("Pick at least one flight on this plan.");
              return;
            }
            manualSubmit.mutate();
          }}
        >
          <button
            type="button"
            className="text-sm font-medium text-primary"
            onClick={() => setMode("chooser")}
          >
            ← Choose another way
          </button>

          {rows.map((row, index) => (
            <div key={row.id} className="space-y-3 rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Flight {index + 1}</p>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove row"
                    onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div>
                <Label>On this plan</Label>
                <Select
                  value={row.segmentKey}
                  onValueChange={(segmentKey) =>
                    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, segmentKey } : r)))
                  }
                >
                  <SelectTrigger className="mt-1.5 h-12">
                    <SelectValue placeholder="Choose flight" />
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

              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Open seats</Label>
                  <Input
                    type="number"
                    min={0}
                    max={400}
                    inputMode="numeric"
                    value={row.openSeats}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, openSeats: e.target.value } : r)),
                      )
                    }
                    className="mt-1.5 h-12"
                  />
                </div>
                <div className="flex-1">
                  <Label>Listed standbys</Label>
                  <Input
                    type="number"
                    min={0}
                    max={400}
                    inputMode="numeric"
                    value={row.standbys}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, standbys: e.target.value } : r)),
                      )
                    }
                    className="mt-1.5 h-12"
                  />
                </div>
              </div>

              <div>
                <Label>Cabin</Label>
                <Select
                  value={row.cabin}
                  onValueChange={(cabin) =>
                    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, cabin } : r)))
                  }
                >
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
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => setRows((prev) => [...prev, newRow(segmentChoices[0]?.key ?? "")])}
          >
            <Plus className="mr-2 h-4 w-4" /> Add another flight
          </Button>

          <PartyField value={partyIncluded} onChange={setPartyIncluded} />

          <Button type="submit" className="h-12 w-full" disabled={manualSubmit.isPending}>
            {manualSubmit.isPending ? "Updating your plan…" : "Save and update the plan"}
          </Button>
        </form>
      )}

      {formError && <p className="mt-4 text-sm text-rough-foreground">{formError}</p>}
      {uncertainNote && <p className="mt-3 text-sm text-muted-foreground">{uncertainNote}</p>}
    </main>
  );
}

function PartyField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>Are your travelers already included in that standby count?</Label>
      <Select value={value} onValueChange={onChange}>
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
        This stays on your account only — it is never shared with the load network.
      </p>
    </div>
  );
}
