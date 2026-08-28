import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

import wordmark from "@/assets/aircue-wordmark.png.asset.json";

export function OnboardingShell({
  step,
  total,
  onBack,
  children,
  action,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-5">
      <header className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="-ml-2 rounded-lg p-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-9 w-9" />
        )}
        <img src={wordmark.url} alt="AirCue" className="h-4 w-auto invert" />
        <span className="h-9 w-9" />
      </header>

      <div className="mt-4 flex gap-1" aria-hidden>
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      <div className="flex-1 pt-7">{children}</div>

      {action && <div className="pt-6">{action}</div>}
    </main>
  );
}

export function ChoiceButton({
  emoji,
  label,
  selected,
  onClick,
}: {
  emoji?: string;
  label: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left text-[15px] font-semibold leading-snug transition-colors ${
        selected
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border bg-card text-foreground hover:border-primary/50"
      }`}
    >
      {emoji && (
        <span aria-hidden className="text-lg">
          {emoji}
        </span>
      )}
      <span className="min-w-0">{label}</span>
    </button>
  );
}
