/** Prices for the shop's own screens (docs/shop.md › Discounts). The cart shows Shopify's figures instead. */
import type { DiscountInfo } from "./sources/types";

/** The percentage a code takes off a Store product, or null when it doesn't apply or isn't a percentage. */
export function percentOff(info: DiscountInfo | null, collectionGid: string, now = new Date()): number | null {
  if (!info || info.status !== "ACTIVE" || info.percentage == null || info.percentage <= 0) return null;
  if (info.startsAt && new Date(info.startsAt) > now) return null;
  if (info.endsAt && new Date(info.endsAt) <= now) return null;
  if (info.collections !== null && !info.collections.includes(collectionGid)) return null;
  return Math.min(1, info.percentage);
}

/** Price after a percentage, to the cent (Shopify rounds each line the same way). */
export function discounted(price: string, pct: number | null): string | null {
  if (pct == null) return null;
  const cents = Math.round(Number(price) * 100);
  if (!Number.isFinite(cents)) return null;
  return (Math.round(cents * (1 - pct)) / 100).toFixed(2);
}

export function formatMoney(amount: string | number, currency: string, locale = "en-US"): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** The cheapest price among sizes, as a decimal string. */
export function lowest(prices: string[]): string | null {
  const ok = prices.filter((p) => Number.isFinite(Number(p)));
  return ok.length ? ok.reduce((a, b) => (Number(b) < Number(a) ? b : a)) : null;
}
