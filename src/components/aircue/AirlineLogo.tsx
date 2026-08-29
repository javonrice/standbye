import { useState } from "react";

import { cn } from "@/lib/utils";

/** Pull the marketing carrier out of a label like "UA3489" or "UA3489 · ORD → LAX". */
export function carrierFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const match = label.trim().toUpperCase().match(/^([A-Z0-9]{2})\s?\d{1,4}\b/);
  return match?.[1] ?? null;
}

function logoUrl(iata: string, size: number): string {
  return `https://images.daisycon.io/airline/?width=${size}&height=${size}&iata=${iata}`;
}

/**
 * Airline mark for a flight. Falls back to the carrier code in a neutral tile
 * whenever the logo service has nothing for that airline.
 */
export function AirlineLogo({
  code,
  size = 36,
  className,
}: {
  code: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const iata = code?.toUpperCase() ?? null;

  if (!iata) return null;

  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background",
    className,
  );

  if (failed) {
    return (
      <span
        className={cn(box, "text-[11px] font-bold tracking-tight text-muted-foreground")}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {iata}
      </span>
    );
  }

  return (
    <span className={box} style={{ width: size, height: size }}>
      <img
        src={logoUrl(iata, size * 2)}
        alt={`${iata} logo`}
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full object-contain p-[3px]"
        onError={() => setFailed(true)}
      />
    </span>
  );
}
