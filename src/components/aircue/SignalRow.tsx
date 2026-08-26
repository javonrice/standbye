import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Confidence = "confirmed" | "strong" | "context";

export interface Signal {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  confidence: Confidence;
  why?: string;
  source?: string;
}

const iconTone: Record<Confidence, string> = {
  confirmed: "text-destructive",
  strong: "text-elevated-foreground",
  context: "text-context",
};

const confidenceLabel: Record<Confidence, string> = {
  confirmed: "Confirmed",
  strong: "Strong signal",
  context: "Context",
};

export function SignalRow({ signal, tone }: { signal: Signal; tone?: "calm" }) {
  const [open, setOpen] = useState(false);
  const Icon = signal.icon;
  const hasWhy = Boolean(signal.why);

  return (
    <div className="border-b border-border/70 last:border-b-0">
      <div className="flex items-start gap-4 py-4">
        <Icon
          className={cn(
            "mt-0.5 h-6 w-6 shrink-0",
            tone === "calm" ? "text-clear-foreground" : iconTone[signal.confidence],
          )}
        />
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-6">
          <p className="font-semibold sm:w-44 sm:shrink-0">{signal.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground sm:mt-0 sm:flex-1">{signal.detail}</p>
        </div>
        {hasWhy && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="hidden sm:inline">Why it matters</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </button>
        )}
      </div>
      {hasWhy && open && (
        <div className="pb-4 pl-10 text-sm text-muted-foreground">
          <p className="text-foreground/80">{signal.why}</p>
          <p className="mt-2 text-xs uppercase tracking-wide">
            {confidenceLabel[signal.confidence]}
            {signal.source ? ` · ${signal.source}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
