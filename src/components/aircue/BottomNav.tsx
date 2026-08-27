import { Link, useLocation } from "@tanstack/react-router";
import { Eye, Home, Users } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/watches", label: "Watching", icon: Eye },
  { to: "/buddies", label: "Buddies", icon: Users },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <>
      {/* Mobile: floating bottom pill */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none md:hidden">
        <nav className="pointer-events-auto relative flex items-center gap-1 rounded-[2rem] bg-black/30 px-2 py-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent" />
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative z-10 flex flex-col items-center justify-center gap-1 rounded-[1.25rem] px-5 py-2 transition-all duration-300 ease-out ${
                  active
                    ? "bg-white/15 text-foreground shadow-inner shadow-white/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[0.65rem] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Desktop: fixed left rail */}
      <nav className="fixed left-0 top-0 z-40 hidden h-screen w-[5.5rem] flex-col items-center gap-2 border-r border-white/10 bg-black/25 py-6 backdrop-blur-2xl md:flex lg:w-56 lg:items-stretch lg:px-4">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-3 transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:px-4 ${
                active
                  ? "bg-white/15 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[0.65rem] font-medium leading-none lg:text-sm">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
