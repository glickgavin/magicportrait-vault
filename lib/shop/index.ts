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

/** The VIP tags from shop.vip_customer_tag: one or more, separated by commas (any case). */
export function vipTags(setting: string): string[] {
  return setting.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

/** VIP when the customer carries any of the VIP tags. */
export function isVip(customerTags: string[] | null | undefined, setting: string): boolean {
  const want = new Set(vipTags(setting));
  return Boolean(customerTags?.some((t) => want.has(t.trim().toLowerCase())));
}

/** VIP when the Shopify customer carries any of shop.vip_customer_tag's tags (any case). No customer, or Shopify down: normal. */
const typeCache = new Map<string, { at: number; type: CustomerType }>();

export async function customerTypeFor(email: string, opts: { fresh?: boolean } = {}): Promise<CustomerType> {
  const s = await getSettings(["shop.vip_customer_tag", "shop.customer_type_cache_minutes"] as const);
  const e = email.trim().toLowerCase();
  const hit = typeCache.get(e);
  if (!opts.fresh && hit && Date.now() - hit.at < s["shop.customer_type_cache_minutes"] * 60_000) return hit.type;
  let type: CustomerType = "normal";
  try {
    const tags = await (await getShopCatalogSource()).customerTags(e);
    type = isVip(tags, s["shop.vip_customer_tag"]) ? "vip" : "normal";
  } catch {
    return "normal"; // not cached, so the next request asks Shopify again
  }
  if (typeCache.size > 5000) typeCache.clear();
  typeCache.set(e, { at: Date.now(), type });
  return type;
}

/** What a customer sees on prices: their code's percentage on Store products, and its label. */
export async function pricingFor(email: string): Promise<{ customerType: CustomerType; code: string | null; label: string; pct: number | null; currency: string; collectionGid: string }> {
  const { percentOff } = await import("./money");
  const s = await getSettings(["shop.currency", "shop.collection_id"] as const);
  const customerType = await customerTypeFor(email);
  const { code, label } = await discountSettingFor(customerType);
  const collectionGid = `gid://shopify/Collection/${s["shop.collection_id"]}`;
  const pct = percentOff(await discountInfoCached(code), collectionGid);
  return { customerType, code, label, pct, currency: s["shop.currency"], collectionGid };
}

const discountCache = new Map<string, { at: number; info: DiscountInfo | null }>();
async function discountInfoCached(code: string | null): Promise<DiscountInfo | null> {
  if (!code) return null;
  const minutes = (await getSettings(["shop.product_cache_minutes"] as const))["shop.product_cache_minutes"];
  const hit = discountCache.get(code);
  if (hit && Date.now() - hit.at < minutes * 60_000) return hit.info;
  const info = await discountInfo(code);
  discountCache.set(code, { at: Date.now(), info });
  return info;
}

/** The codes to put on a Shopify cart: none for an automatic discount (Shopify applies that itself). */
export async function cartCodesFor(code: string | null): Promise<string[]> {
  if (!code) return [];
  const info = await discountInfoCached(code);
  return info?.automatic ? [] : [code];
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
