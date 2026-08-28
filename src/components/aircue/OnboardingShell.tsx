import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

import mark from "@/assets/standbye-mark.png.asset.json";

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
  const progress = Math.round(((step + 1) / total) * 100);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-6 pt-4">
      <header className="flex items-center gap-3 py-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-10 w-10 shrink-0" />
        )}

        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Onboarding progress"
        >
          <span
            className="block h-full rounded-full bg-foreground transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <img
          src={mark.url}
          alt=""
          aria-hidden
          className="h-6 w-6 shrink-0 object-contain opacity-60"
        />
      </header>

      <div className="flex-1 pt-8">{children}</div>

      {action && (
        <div className="sticky bottom-0 -mx-6 mt-8 bg-gradient-to-t from-background via-background to-transparent px-6 pb-2 pt-5">
          {action}
        </div>
      )}
    </main>
  );
}

export function OnboardingTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-display text-[30px] font-bold leading-[1.12] tracking-tight">{children}</h1>
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
      aria-pressed={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 rounded-2xl px-4 py-4 text-left text-[16px] font-semibold leading-snug transition-all duration-200 active:scale-[0.99] ${
        selected
          ? "bg-foreground text-background shadow-card"
          : "bg-muted text-foreground hover:bg-accent"
      }`}
    >
      {emoji && (
        <span
          aria-hidden
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
            selected ? "bg-background/15" : "bg-background"
          }`}
        >
          {emoji}
        </span>
      )}
      <span className="min-w-0">{label}</span>
    </button>
  );
}
