import "server-only";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { getSettings } from "@/lib/settings";
import { canSeeShop } from "./access";
import { evaluateCatalog, type CatalogEntry } from "./catalog";
import { getShopCatalogSource } from "./sources";
import type { DiscountInfo } from "./sources/types";

/** Can this person see the shop? Customers only once shop.enabled is on; super users with the preview switch. */
export async function shopVisibleTo(user: SessionUser | null): Promise<boolean> {
  const s = await getSettings(["shop.enabled", "shop.super_user_preview"] as const);
  return canSeeShop({ enabled: s["shop.enabled"], superUserPreview: s["shop.super_user_preview"] }, user);
}

/** For shop routes: the signed-in person when they can see the shop, else null (the caller returns 404). */
export async function shopUserOrNull(): Promise<SessionUser | null> {
  const u = await getSessionUser();
  return u && (await shopVisibleTo(u)) ? u : null;
}

type Cached = { at: number; entries: CatalogEntry[] };
const g = globalThis as unknown as { __shopCatalog?: Cached | null };

export function invalidateCatalog() {
  g.__shopCatalog = null;
}

/** The Store collection, evaluated, cached for shop.product_cache_minutes. `fresh` for Settings. */
export async function getCatalog(opts: { fresh?: boolean } = {}): Promise<CatalogEntry[]> {
  const s = await getSettings(["shop.collection_id", "shop.metafield_namespace", "shop.product_cache_minutes", "shop.default_min_short_side_px", "shop.default_max_crop_pct"] as const);
  const hit = g.__shopCatalog;
  if (!opts.fresh && hit && Date.now() - hit.at < s["shop.product_cache_minutes"] * 60_000) return hit.entries;
  const src = await getShopCatalogSource();
  const products = await src.storeProducts(s["shop.collection_id"], s["shop.metafield_namespace"]);
  const entries = evaluateCatalog(products, { minShortSidePx: s["shop.default_min_short_side_px"], maxCropPct: s["shop.default_max_crop_pct"] });
  g.__shopCatalog = { at: Date.now(), entries };
  return entries;
}

export type CustomerType = "normal" | "vip";

/** VIP when the Shopify customer carries shop.vip_customer_tag (any case). No customer, or Shopify down: normal. */
export async function customerTypeFor(email: string): Promise<CustomerType> {
  const tag = (await getSettings(["shop.vip_customer_tag"] as const))["shop.vip_customer_tag"].trim().toLowerCase();
  try {
    const tags = await (await getShopCatalogSource()).customerTags(email);
    return tags?.some((t) => t.trim().toLowerCase() === tag) ? "vip" : "normal";
  } catch {
    return "normal";
  }
}

/** The code and label for a customer type; an empty VIP code falls back to the normal one. */
export async function discountSettingFor(type: CustomerType): Promise<{ code: string | null; label: string }> {
  const s = await getSettings(["shop.discount_code_normal", "shop.discount_code_vip", "shop.discount_label_normal", "shop.discount_label_vip"] as const);
  const normal = s["shop.discount_code_normal"].trim() || null;
  if (type === "vip") return { code: s["shop.discount_code_vip"].trim() || normal, label: s["shop.discount_label_vip"] };
  return { code: normal, label: s["shop.discount_label_normal"] };
}

/** Looks up a code in Shopify; null when it doesn't exist or can't be read (prices then show without it). */
export async function discountInfo(code: string | null): Promise<DiscountInfo | null> {
  if (!code) return null;
  try {
    return await (await getShopCatalogSource()).discountByCode(code);
  } catch {
    return null;
  }
}
