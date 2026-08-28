import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Bell, User } from "lucide-react";

import mark from "@/assets/standbye-mark.png.asset.json";
import wordmark from "@/assets/standbye-wordmark.png.asset.json";

const items = [
  { to: "/plan", label: "Plan", icon: Compass },
  { to: "/watching", label: "Watching", icon: Bell },
  { to: "/you", label: "You", icon: User },
] as const;

export function MainNav() {
  const location = useLocation();
  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <>
      {/* Mobile: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-2 py-1.5">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={`flex min-w-[72px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                  isActive(to) ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" strokeWidth={isActive(to) ? 2.4 : 1.9} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: side rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-card px-4 py-6 md:block">
        <Link to="/plan" className="mb-9 flex items-center gap-2 px-2">
          <img src={mark.url} alt="" aria-hidden className="h-8 w-8" />
          <img src={wordmark.url} alt="Standbye" className="h-6 w-auto" />
        </Link>
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                  isActive(to)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
