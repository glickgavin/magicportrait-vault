import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PortraitTile({ src, alt, ordered, className }: { src: string; alt: string; ordered?: boolean; className?: string }) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-[12px] bg-[#EADFD0]", className)}>
      <img src={src} alt={alt} loading="lazy" decoding="async" width={300} height={300} className="h-full w-full object-cover" />
      {ordered && (
        <span className="absolute bottom-2 left-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[#1f6b35] shadow-sm">{t("portraits.ordered")}</span>
      )}
    </div>
  );
}
