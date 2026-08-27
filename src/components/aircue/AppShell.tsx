import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import wordmark from "@/assets/aircue-wordmark.png.asset.json";
import mark from "@/assets/aircue-mark.png.asset.json";

export function AppShell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={mark.url} alt="" aria-hidden className="h-8 w-8 invert" />
            <img src={wordmark.url} alt="Aircue" className="h-6 w-auto invert" />
          </Link>
          {nav && (
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                Check a flight
              </Link>
              <Link to="/watches" className="text-muted-foreground hover:text-foreground">
                My watches
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 text-xs text-muted-foreground sm:px-6">
          <p>Aircue is a standby pressure monitor, not a seat predictor.</p>
        </div>
      </footer>
    </div>
  );
}
