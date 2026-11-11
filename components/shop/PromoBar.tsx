"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PromoView } from "@/lib/shop/shell";
import { t } from "@/lib/i18n";
import { trackClient } from "@/lib/track-client";
import { cn } from "@/lib/utils";

const key = (p: PromoView) => `promo-closed:${p.id}:${p.text.length}:${p.text.slice(0, 24)}`;

/** The promotion bar above the header. Closed bars stay closed for the visit, and come back when the text changes. */
export function PromoBar({ promo, audience }: { promo: PromoView; audience: string }) {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(key(promo)) === "1") setClosed(true);
    } catch {
      /* no storage: it stays open */
    }
  }, [promo]);
  if (closed) return null;
  const tint = promo.style === "tint";
  const body = (
    <>
      {promo.text}
      {promo.linkLabel && (
        <>
          {" · "}
          <span className="underline">{promo.linkLabel}</span>
        </>
      )}
    </>
  );
  const textClass = cn("truncate text-[13px] font-bold sm:text-[14px]", tint ? "text-pink-dark" : "text-white");
  const tapped = () => trackClient("promo_bar_tapped", { bar_id: promo.id, audience });
  return (
    <div role="region" aria-label={t("shop.promotion")} className={cn("relative flex h-10 items-center justify-center px-11", tint ? "border-b border-[#B8059F]/15 bg-pink-tint" : "bg-primary-gradient")}>
      {promo.linkUrl ? (
        promo.linkUrl.startsWith("/") ? (
          <Link href={promo.linkUrl} onClick={tapped} className={textClass}>
            {body}
          </Link>
        ) : (
          <a href={promo.linkUrl} onClick={tapped} className={textClass}>
            {body}
          </a>
        )
      ) : (
        <span className={textClass}>{body}</span>
      )}
      {promo.closable && (
        <button
          type="button"
          aria-label={t("shop.closePromotion")}
          onClick={() => {
            setClosed(true);
            trackClient("promo_bar_closed", { bar_id: promo.id, audience });
            try {
              window.sessionStorage.setItem(key(promo), "1");
            } catch {
              /* ignore */
            }
          }}
          className="absolute right-0 top-0 flex h-10 w-11 items-center justify-center"
        >
          <X className={cn("h-4 w-4", tint ? "text-pink-dark" : "text-white")} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
