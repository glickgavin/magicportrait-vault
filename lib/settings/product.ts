import "server-only";
import type { ShopProduct, ShopVariant } from "@/lib/shop/sources/types";
import { getSetting } from "./index";
import { readProductField, readVariantField } from "./product-fields";
import { PRODUCT_FIELDS, type ProductFieldDef, type ProductFieldKey, type ProductFieldValue } from "./registry";

/**
 * A product's own value for a field, else the store setting it falls back to, else the field's default,
 * as getSetting() does for the store. A bad value set by hand in Shopify is ignored (and flagged in Settings).
 */
export async function getProductSetting<K extends ProductFieldKey>(product: ShopProduct, key: K): Promise<ProductFieldValue<K>> {
  const r = readProductField(product, key);
  if (r.state === "set") return r.value as ProductFieldValue<K>;
  return fallback(key);
}

export async function getVariantSetting<K extends ProductFieldKey>(variant: ShopVariant, key: K): Promise<ProductFieldValue<K>> {
  const r = readVariantField(variant, key);
  if (r.state === "set") return r.value as ProductFieldValue<K>;
  return fallback(key);
}

async function fallback<K extends ProductFieldKey>(key: K): Promise<ProductFieldValue<K>> {
  const d = PRODUCT_FIELDS[key] as unknown as ProductFieldDef<unknown>;
  if (d.fallback) return (await getSetting(d.fallback)) as ProductFieldValue<K>;
  return d.default as ProductFieldValue<K>;
}

/** The store default a field shows in grey when a product has none (Settings › Shop › one product). */
export async function productFieldDefaults(): Promise<Record<ProductFieldKey, unknown>> {
  const out = {} as Record<ProductFieldKey, unknown>;
  for (const key of Object.keys(PRODUCT_FIELDS) as ProductFieldKey[]) out[key] = await fallback(key);
  return out;
}
