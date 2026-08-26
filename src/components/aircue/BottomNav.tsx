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
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-[calc(1rem+env(safe-area-inset-bottom))] pointer-events-none">
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
  );
}
