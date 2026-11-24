import "server-only";
import { getSettings } from "@/lib/settings";
import { getImagenApi, type ImagenTheme } from "@/lib/sources/imagen-api";
import { evaluateStoreProduct, type StoreEntry } from "./catalog";
import { getOpenStoreSource } from "./sources";
import type { StoreCollection } from "./sources/types";

type Cached = { at: number; collection: StoreCollection; entries: StoreEntry[] } | { at: number; collection: null; entries: [] };
const g = globalThis as unknown as { __openStoreCatalog?: Cached | null; __imagenThemes?: { at: number; themes: ImagenTheme[] } | null };

/** Imagen's theme list, cached 10 minutes; null when it can't be read (themes are then not checked). */
export async function imagenThemes(opts: { fresh?: boolean } = {}): Promise<ImagenTheme[] | null> {
  const hit = g.__imagenThemes;
  if (!opts.fresh && hit && Date.now() - hit.at < 10 * 60_000) return hit.themes;
  try {
    const themes = await getImagenApi().themes();
    g.__imagenThemes = { at: Date.now(), themes };
    return themes;
  } catch {
    return hit?.themes ?? null;
  }
}

/**
 * The Magic Store collection, checked (docs/open-store.md), cached for shop.product_cache_minutes like the
 * shop's catalog. A Settings › Shop save stamps shop.catalog_changed_at, so every server reads Shopify again.
 * `fresh` for Settings.
 */
export async function getStoreCatalog(opts: { fresh?: boolean } = {}): Promise<{ collection: StoreCollection | null; entries: StoreEntry[] }> {
  const s = await getSettings(["open_store.collection", "shop.metafield_namespace", "shop.product_cache_minutes", "shop.catalog_changed_at", "shop.default_min_short_side_px", "shop.default_max_crop_pct", "open_store.storefront_publication_id"] as const);
  const hit = g.__openStoreCatalog;
  if (!opts.fresh && hit && hit.at > s["shop.catalog_changed_at"] && Date.now() - hit.at < s["shop.product_cache_minutes"] * 60_000) return hit;
  const [src, themes] = await Promise.all([getOpenStoreSource(), imagenThemes({ fresh: opts.fresh })]);
  const r = await src.storeProducts(s["open_store.collection"], s["shop.metafield_namespace"]);
  const out: Cached = r
    ? {
        at: Date.now(),
        collection: r.collection,
        entries: r.products.map((p) => evaluateStoreProduct(p, { defaults: { minShortSidePx: s["shop.default_min_short_side_px"], maxCropPct: s["shop.default_max_crop_pct"] }, publicationId: s["open_store.storefront_publication_id"], themes })),
      }
    : { at: Date.now(), collection: null, entries: [] };
  g.__openStoreCatalog = out;
  return out;
}

const reads = globalThis as unknown as { __openStoreReads?: Map<string, { at: number; value: unknown }> };

/**
 * A cached Shopify read for the store pages (a category collection, the menu, policies): kept for
 * shop.product_cache_minutes and dropped when Settings › Shop saves (shop.catalog_changed_at).
 */
export async function cachedRead<T>(key: string, read: () => Promise<T>): Promise<T> {
  const s = await getSettings(["shop.product_cache_minutes", "shop.catalog_changed_at"] as const);
  const map = (reads.__openStoreReads ??= new Map());
  const hit = map.get(key);
  if (hit && hit.at > s["shop.catalog_changed_at"] && Date.now() - hit.at < s["shop.product_cache_minutes"] * 60_000) return hit.value as T;
  const value = await read();
  map.set(key, { at: Date.now(), value });
  return value;
}

/** Drop this server's copy (lib/shop's invalidateCatalog() also stamps the change for every server). */
export function forgetStoreCatalog() {
  g.__openStoreCatalog = null;
  reads.__openStoreReads?.clear();
}
