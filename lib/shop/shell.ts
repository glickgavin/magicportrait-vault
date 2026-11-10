import "server-only";
import type { SessionUser } from "@/lib/auth/types";
import { dayIn } from "@/lib/biztime";
import { getSettings } from "@/lib/settings";
import type { PromoBarSetting } from "@/lib/settings/registry";
import { canSeeShop } from "./access";

/** Light on purpose: the customer layout imports this on every page, so the shop's heavier code loads only when visible. */
export type CustomerType = "normal" | "vip";

export type PromoView = { id: string; text: string; linkLabel: string; linkUrl: string; style: "tint" | "gradient"; closable: boolean };

/** The promotion bar for this person today (business-time days), or null. */
export async function promoFor(customerType: CustomerType, now = new Date()): Promise<PromoView | null> {
  const s = await getSettings(["site.promo_bars", "site.promo_bar_max_chars", "brand.timezone"] as const);
  const today = dayIn(s["brand.timezone"], now);
  const live = (s["site.promo_bars"] as PromoBarSetting[]).filter((b) => b.on && (!b.starts || b.starts <= today) && (!b.ends || b.ends >= today) && (b.audience === "everyone" || b.audience === customerType));
  const pick = live.find((b) => b.audience === customerType) ?? live.find((b) => b.audience === "everyone");
  if (!pick) return null;
  const max = s["site.promo_bar_max_chars"];
  const text = pick.text.length > max ? `${pick.text.slice(0, max - 1).trimEnd()}…` : pick.text;
  return { id: pick.id, text, linkLabel: pick.link_label, linkUrl: pick.link_url, style: pick.style, closable: pick.closable };
}

/** What the header, menu and promotion bar need; null while the shop is hidden from this person. */
export async function shopShell(user: SessionUser | null): Promise<{ cartCount: number; promo: PromoView | null; customerType: CustomerType } | null> {
  if (!user) return null;
  try {
    const s = await getSettings(["shop.enabled", "shop.super_user_preview"] as const);
    if (!canSeeShop({ enabled: s["shop.enabled"], superUserPreview: s["shop.super_user_preview"] }, user)) return null;
    const { cartCount } = await import("./cart");
    const { customerTypeFor } = await import("./index");
    const [count, type] = await Promise.all([cartCount(user.email), customerTypeFor(user.email)]);
    return { cartCount: count, promo: await promoFor(type).catch(() => null), customerType: type };
  } catch {
    return null;
  }
}
