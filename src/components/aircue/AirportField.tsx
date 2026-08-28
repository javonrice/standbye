import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchAirports } from "@/lib/aircue/airports.functions";

/**
 * Expedia-style field row: quiet label on top, large value underneath.
 * The whole row is the tap target.
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
  const search = useServerFn(searchAirports);
  const { data: options } = useQuery({
    queryKey: ["airports", value],
    queryFn: () => search({ data: { q: value } }),
    enabled: value.length >= 2,
  });

  const match = (options ?? []).find((a) => a.iata === value);

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-[12px] font-medium text-muted-foreground">
          {label}
        </Label>
        <Input
          id={id}
          list={`${id}-options`}
          required
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={placeholder}
          className="h-8 w-full border-0 bg-transparent p-0 text-[19px] font-semibold uppercase tracking-tight shadow-none focus-visible:ring-0"
        />
      </div>
      {match && (
        <span className="max-w-[42%] shrink-0 truncate text-right text-[13px] text-muted-foreground">
          {match.city ?? match.name}
        </span>
      )}



      <datalist id={`${id}-options`}>
        {(options ?? []).map((a) => (
          <option key={a.iata} value={a.iata}>
            {a.city ?? a.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}
