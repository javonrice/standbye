import { useState, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { searchAirports } from "@/lib/aircue/airports.functions";

/**
 * Expedia-style field row with a compact, anchored airport dropdown.
 * Origin and destination share identical behavior.
 */
export function AirportField({
  id,
  label,
  value,
  placeholder = "DEN",
  icon: Icon,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  icon?: LucideIcon;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const search = useServerFn(searchAirports);
  const { data: options } = useQuery({
    queryKey: ["airports-search", value],
    queryFn: () => search({ data: { q: value } }),
    enabled: value.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  const normalized = value.toUpperCase();
  const match = (options ?? []).find((a) => a.iata === normalized);
  const trimmed = normalized.trim();
  const hasOptions = trimmed.length >= 2 && (options?.length ?? 0) > 0;

  const select = (iata: string) => {
    onChange(iata);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <Popover open={open && hasOptions} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className="flex items-center gap-3 px-4 py-3.5"
          onPointerDown={() => {
            if (document.activeElement !== inputRef.current) {
              inputRef.current?.focus();
            }
          }}
        >
          {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <Label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
              {label}
            </Label>
            <Input
              ref={inputRef}
              id={id}
              required
              maxLength={3}
              autoCapitalize="characters"
              autoComplete="off"
              value={value}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 180)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={placeholder}
              className="h-8 w-full border-0 bg-transparent p-0 text-[19px] font-semibold uppercase tracking-tight shadow-none focus-visible:ring-0"
            />
          </div>
          {match && (
            <span className="max-w-[42%] shrink-0 truncate text-right text-[13px] text-muted-foreground">
              {match.city ?? match.name}
            </span>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="max-h-60 w-auto overflow-hidden border-border bg-card p-0 shadow-card"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <ul role="listbox" className="max-h-60 overflow-auto py-1">
          {(options ?? []).slice(0, 6).map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                role="option"
                aria-selected={a.iata === normalized}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(a.iata)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60"
              >
                <span className="min-w-[2.25rem] text-[15px] font-bold tracking-tight">
                  {a.iata}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {a.city ?? a.name}
                  {a.city && a.name !== a.city ? (
                    <span className="ml-1 text-muted-foreground">· {a.name}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
