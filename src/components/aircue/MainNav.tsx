import { Link, useLocation } from "@tanstack/react-router";
import { Home, Map, Bell, User } from "lucide-react";

import wordmark from "@/assets/standbye-wordmark.png.asset.json";

const items = [
  {
    to: "/plan",
    label: "Home",
    icon: Home,
    match: (path: string) =>
      path === "/plan" || path === "/known-flight" || path.startsWith("/known-flight"),
  },
  {
    to: "/plans",
    label: "Plans",
    icon: Map,
    match: (path: string) => path === "/plans" || path.startsWith("/plans/"),
  },
  {
    to: "/updates",
    label: "Updates",
    icon: Bell,
    match: (path: string) =>
      path === "/updates" ||
      path.startsWith("/updates/") ||
      path === "/watching" ||
      path.startsWith("/watching/"),
  },
  {
    to: "/you",
    label: "You",
    icon: User,
    match: (path: string) => path === "/you" || path.startsWith("/you/"),
  },
] as const;

export function MainNav() {
  const location = useLocation();

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="mx-auto flex max-w-md justify-around px-2 py-1">
          {items.map(({ to, label, icon: Icon, match }) => {
            const active = match(location.pathname);
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    active ? "bg-accent/70 text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 1.8} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>


      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-card px-4 py-6 md:block">
        <Link to="/plan" className="mb-9 block px-1">
          <img src={wordmark.url} alt="Standbye" className="h-14 w-auto object-contain" />
        </Link>
        <ul className="space-y-1">
          {items.map(({ to, label, icon: Icon, match }) => {
            const active = match(location.pathname);
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
