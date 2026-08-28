import { Link, useLocation } from "@tanstack/react-router";
import { Compass, Bell, User } from "lucide-react";

import mark from "@/assets/aircue-mark.png.asset.json";
import wordmark from "@/assets/aircue-wordmark.png.asset.json";

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
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-2 py-2">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 text-[10px] font-semibold ${
                  isActive(to) ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${isActive(to) ? "text-primary" : "text-muted-foreground"}`}
                  strokeWidth={isActive(to) ? 2.5 : 2}
                />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: side rail */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-border bg-surface px-4 py-6 md:block">
        <Link to="/plan" className="mb-8 flex items-center gap-2.5">
          <img src={mark.url} alt="" aria-hidden className="h-7 w-7 invert" />
          <img src={wordmark.url} alt="AirCue" className="h-5 w-auto invert" />
        </Link>
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                  isActive(to)
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}
