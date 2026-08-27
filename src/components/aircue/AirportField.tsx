import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchAirports } from "@/lib/aircue/brief.functions";

export function AirportField({
  id,
  label,
  value,
  placeholder = "DEN",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const search = useServerFn(searchAirports);
  const { data: options } = useQuery({
    queryKey: ["airports", value],
    queryFn: () => search({ data: { q: value } }),
    enabled: value.length >= 2,
  });

  return (
    <div className="flex-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
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
        className="mt-1.5 h-12 bg-surface text-base uppercase"
      />
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
