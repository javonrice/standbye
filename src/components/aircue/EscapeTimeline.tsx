import type { ReactNode } from "react";

import { judgmentFace, type Shot } from "@/lib/aircue/standby";

/**
 * A single vertical rail down the screen: how to get out, the connection where
 * standby has to clear a second time, then how to finish the trip.
 */
export function EscapeTimeline({
  origin,
  hub,
  hubCity,
  dest,
  shots,
  onward,
}: {
  origin: string;
  hub: string;
  hubCity: string;
  dest: string;
  shots: Shot[];
  onward: string[];
}) {
  return (
    <div className="relative pl-6">
      <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

      <Heading>Get out of {origin}</Heading>
      {shots.length > 0 ? (
        shots.map((shot) => (
          <Node key={`${shot.flightLabel}-${shot.depLocal}`} time={shot.depLocal}>
            <span className="font-medium">{shot.flightLabel}</span>
            <span className="ml-2 text-muted-foreground">
              {judgmentFace[shot.judgment]} {shot.judgment === "favorable" ? "worth trying" : shot.judgment === "mixed" ? "possible" : "tight"}
            </span>
          </Node>
        ))
      ) : (
        <Node time="—">
          <span className="text-muted-foreground">
            No named departures came back for this leg today.
          </span>
        </Node>
      )}

      <div className="relative py-4">
        <Dot solid />
        <p className="font-display text-[16px] font-semibold tracking-tight">
          Connect in {hubCity}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          You clear standby a second time here — that's the real cost of this routing.
        </p>
      </div>

      <Heading>Once you're in {hubCity}</Heading>
      {onward.length > 0 ? (
        onward.map((time) => (
          <Node key={time} time={time}>
            <span className="text-muted-foreground">
              {hub} → {dest}
            </span>
          </Node>
        ))
      ) : (
        <Node time="—">
          <span className="text-muted-foreground">Nothing useful onward right now.</span>
        </Node>
      )}
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <p className="relative pb-1 pt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </p>
  );
}

function Node({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="relative flex items-baseline gap-3 py-2">
      <Dot />
      <span className="w-[68px] shrink-0 text-[13px] tabular-nums text-muted-foreground">
        {time}
      </span>
      <span className="min-w-0 flex-1 text-[14px]">{children}</span>
    </div>
  );
}

function Dot({ solid = false }: { solid?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute -left-[23px] top-3 h-[9px] w-[9px] rounded-full ring-2 ring-background ${
        solid ? "bg-primary" : "bg-border"
      }`}
    />
  );
}
