"use client";

import Link from "next/link";
import type { CardView } from "@/lib/open-store/pages";
import { formatMoney } from "@/lib/shop/money";
import { t, tn } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";
import { Stars } from "./Stars";

/** A product in the grid: first image, title, theme, "From" price, the old price struck through, the discount badge. */
export function ProductCard({ card, currency, position, collection, small = false, from = "grid" }: { card: CardView; currency: string; position: number; collection: string; small?: boolean; from?: "grid" | "related" }) {
  return (
    <Link
      href={`/store/product/${card.legacyId}?from=${from}`}
      onClick={() => from === "grid" && trackClient("store_product_tapped", { product_id: card.legacyId, collection, position })}
      className="group flex flex-col gap-1.5 text-ink"
      data-testid="store-card"
    >
      <span className="relative block">
        {card.image ? (
          <img src={card.image.url} alt={card.image.alt} className={cn("block aspect-square w-full bg-page object-cover object-top", small ? "rounded-[10px]" : "rounded-[12px]")} loading="lazy" />
        ) : (
          <span className={cn("block aspect-square w-full bg-page", small ? "rounded-[10px]" : "rounded-[12px]")} aria-hidden="true" />
        )}
        {card.badge != null && !small && <span className="absolute left-2 top-2 rounded-full bg-[#B8059F] px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-white">{t("store.off", { pct: card.badge })}</span>}
      </span>
      <span data-testid="store-card-title" className={cn("pt-1 font-extrabold leading-[1.3] group-hover:underline", small ? "text-[13px]" : "text-[14px]")}>{card.title}</span>
      {card.themeName && !small && <span className="text-[13px] leading-[1.3] text-[#616161]">{card.themeName}</span>}
      {card.rating != null && card.ratingCount != null && !small && (
        <span className="flex items-center gap-1.5 text-[12px] text-[#616161]">
          <Stars rating={card.rating} size={12} />
          {tn("store.reviews", card.ratingCount)}
        </span>
      )}
      <span className="flex flex-wrap items-baseline gap-[7px]">
        <span className={small ? "text-[13px] text-[#2b2b2b]" : "text-[16px] font-extrabold text-[#1a1a1a]"}>{card.many ? t("store.from", { price: formatMoney(card.price, currency) }) : formatMoney(card.price, currency)}</span>
        {card.was && !small && (
          <span className="text-[13px] text-[#6b6b6b] line-through">
            <span className="sr-only">{t("store.wasPrice", { price: "" })}</span>
            {formatMoney(card.was, currency)}
          </span>
        )}
      </span>
    </Link>
  );
}
