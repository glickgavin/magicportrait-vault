import Link from "next/link";
import { Gift, ShoppingBag } from "lucide-react";
import { t } from "@/lib/i18n";

/** Home: the two ways into the shop (docs/shop.md). Rendered only while the shop is visible to this person. */
export function ShopWaysIn() {
  return (
    <section aria-labelledby="shop-ways" className="mx-auto mt-8 flex max-w-[640px] flex-col gap-3" data-testid="shop-ways-in">
      <h2 id="shop-ways" className="text-[18px] font-extrabold">
        {t("shop.waysTitle")}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/gifts" className="flex flex-col gap-1 rounded-[20px] bg-pink-tint p-4 text-ink">
          <Gift className="h-6 w-6 text-pink-link" aria-hidden="true" />
          <span className="text-[16px] font-extrabold text-pink-dark">{t("shop.gifts")}</span>
          <span className="text-[12px] leading-4 text-ink-2">{t("shop.waysGifts")}</span>
        </Link>
        <Link href="/products" className="flex flex-col gap-1 rounded-[20px] bg-white p-4 text-ink shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <ShoppingBag className="h-6 w-6 text-pink-link" aria-hidden="true" />
          <span className="text-[16px] font-extrabold">{t("shop.products")}</span>
          <span className="text-[12px] leading-4 text-ink-2">{t("shop.waysProducts")}</span>
        </Link>
      </div>
    </section>
  );
}

/** My portraits: a short banner with both ways in. */
export function PortraitsShopBanner() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[16px] bg-pink-tint px-4 py-3" data-testid="shop-portraits-banner">
      <span className="flex-1 text-[14px] font-bold text-pink-dark">{t("shop.portraitsBanner")}</span>
      <Link href="/gifts/choose" className="flex h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-bold text-pink-dark">
        {t("shop.giveGift")}
      </Link>
      <Link href="/products/choose" className="flex h-9 items-center rounded-[10px] bg-white px-3 text-[13px] font-bold text-pink-dark">
        {t("shop.putOnProduct")}
      </Link>
    </div>
  );
}
