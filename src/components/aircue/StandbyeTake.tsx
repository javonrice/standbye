import markAsset from "@/assets/standbye-mark.png.asset.json";
import { cn } from "@/lib/utils";

/** One short conclusion from Standbye. Used once per major screen. */
export function StandbyeTake({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl bg-accent px-4 py-3.5", className)}>
      <img src={markAsset.url} alt="" aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="text-[15px] leading-snug text-accent-foreground">
        <span className="font-semibold">Standbye's take. </span>
        {children}
      </p>
    </div>
  );
}
