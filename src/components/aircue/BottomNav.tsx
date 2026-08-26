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
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/85 pb-[env(safe-area-inset-bottom)] shadow-card backdrop-blur-xl">
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {items.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 rounded-xl px-4 py-1.5 transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[0.65rem] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
