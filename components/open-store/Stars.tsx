import { t } from "@/lib/i18n";

/** Five stars filled to the rating (only shown when the standard reviews metafields exist). */
export function Stars({ rating, size = 15 }: { rating: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (fill: string) => (
    <svg width={size * 5 + 8} height={size} viewBox={`0 0 ${size * 5 + 8} ${size}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} transform={`translate(${i * (size + 2)} 0) scale(${size / 15})`} d="M7.5 0l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L3 13.8l.9-5L.3 5.3l5-.7z" fill={fill} />
      ))}
    </svg>
  );
  return (
    <span role="img" aria-label={t("store.rated", { rating })} className="relative inline-block leading-none">
      {row("#E7E3D8")}
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row("#1a1a1a")}
      </span>
    </span>
  );
}
