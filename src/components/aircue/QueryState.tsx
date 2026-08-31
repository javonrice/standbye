import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Grey blocks that hold the same shape the content will take. */
export function ScreenSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse space-y-3", className)} aria-hidden>
      <div className="h-6 w-2/5 rounded-md bg-muted" />
      <div className="h-44 w-full rounded-3xl bg-muted" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-16 rounded-2xl bg-muted" />
        <div className="h-16 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

/** A failed read should always say so and offer one tap to try again. */
export function QueryError({
  title = "We couldn't load this",
  message,
  onRetry,
  retrying,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-2xl border border-border bg-card p-5 text-center shadow-card"
    >
      <AlertTriangle className="mx-auto h-6 w-6 text-rough" aria-hidden />
      <p className="mt-2 text-[15px] font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        {message ?? "The connection dropped or the request timed out."}
      </p>
      <Button onClick={onRetry} disabled={retrying} className="mt-4 h-11 w-full rounded-xl">
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}

/** Loading / error / empty in one wrapper so every screen behaves the same. */
export function QueryState({
  isLoading,
  isError,
  onRetry,
  errorTitle,
  errorMessage,
  skeleton,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  errorTitle?: string;
  errorMessage?: string;
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (isError) {
    return (
      <QueryError
        {...(errorTitle ? { title: errorTitle } : {})}
        {...(errorMessage ? { message: errorMessage } : {})}
        onRetry={onRetry}
      />
    );
  }
  if (isLoading) return <>{skeleton ?? <ScreenSkeleton className="mt-6" />}</>;
  return <>{children}</>;
}
