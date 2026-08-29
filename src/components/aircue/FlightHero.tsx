import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Flighty-style flight header: small metadata, very large airport codes and
 * times, quiet supporting line. Presentation only.
 */
export function FlightHero({
  eyebrow,
  origin,
  dest,
  depLocal,
  arrLocal,
  footnote,
  className,
}: {
  eyebrow?: string;
  origin: string;
  dest: string;
  depLocal?: string | null;
  arrLocal?: string | null;
  footnote?: string;
  className?: string;
}) {
  return (
    <section className={cn("", className)}>
      {eyebrow && (
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {eyebrow}
        </p>
      )}

      <div className="mt-2 flex items-end gap-4">
        <Endpoint code={origin} time={depLocal} label="Departs" />
        <ArrowRight className="mb-4 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <Endpoint code={dest} time={arrLocal} label="Arrives" align="right" />
      </div>

      {footnote && <p className="mt-3 text-[14px] text-muted-foreground">{footnote}</p>}
    </section>
  );
}

function Endpoint({
  code,
  time,
  label,
  align = "left",
}: {
  code: string;
  time: string | null | undefined;
  label: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0 flex-1", align === "right" && "text-right")}>
      <p className="font-display text-[40px] font-bold leading-none tracking-tight">{code}</p>
      <p className="mt-2 text-[17px] font-semibold leading-none">
        <LocalTime value={time} />
      </p>

      <p className="mt-1 text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}
