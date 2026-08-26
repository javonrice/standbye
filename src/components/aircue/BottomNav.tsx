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
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <nav className="pointer-events-auto flex items-center gap-1 rounded-full bg-card/90 px-2 py-2 shadow-2xl ring-1 ring-border/40 backdrop-blur-xl">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 rounded-full px-5 py-2 transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[0.65rem] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
