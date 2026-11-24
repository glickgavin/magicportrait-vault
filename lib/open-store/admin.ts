import "server-only";
import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { parseGeneration } from "@/lib/settings/product-fields";
import { PRODUCT_FIELDS, type ProductFieldDef, type ProductFieldKey } from "@/lib/settings/registry";
import { getCatalog, invalidateCatalog } from "@/lib/shop";
import type { AdminResult } from "@/lib/shop/admin";
import type { CatalogEntry } from "@/lib/shop/catalog";
import { getShopCatalogSource } from "@/lib/shop/sources";
import type { ProductMetafieldChange, ShopProduct, VariantRuleChange } from "@/lib/shop/sources/types";
import type { ImagenTheme } from "@/lib/sources/imagen-api";
import { track } from "@/lib/track";
import type { StoreEntry } from "./catalog";
import { getStoreCatalog, imagenThemes } from "./index";

/**
 * Settings › Shop as one area for both stores (docs/open-store.md › Settings: one area for both stores).
 * Every write here is CLAUDE.md allowed write 5: `mmp_shop` fields on products in the Store or Magic Store
 * collection, and the `mmp_shop.imagen_theme` definition's choices.
 */

/** One product in either collection, listed once, with how each store sees it. */
export type ProductRow = {
  product: ShopProduct;
  /** The signed-in Gifts and Products pages (the Store collection); null when not in it. */
  shop: CatalogEntry | null;
  /** The Magic Store; null when not in the Magic Store collection. */
  store: StoreEntry | null;
};

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/not configured/.test(m)) return "Shopify isn't configured in this environment.";
  return "Couldn't read Shopify just now. Try again in a minute.";
}

/** Every product in either collection, each once: the Store collection's order, then the Magic Store's own products. */
export async function productRows(): Promise<{ ok: true; rows: ProductRow[]; themes: ImagenTheme[] | null; magicCollection: string | null } | { ok: false; error: string }> {
  try {
    const [shop, store, themes] = await Promise.all([getCatalog({ fresh: true }), getStoreCatalog({ fresh: true }), imagenThemes()]);
    const byId = new Map<string, ProductRow>();
    for (const e of shop) byId.set(e.product.id, { product: e.product, shop: e, store: null });
    for (const e of store.entries) {
      const row = byId.get(e.product.id);
      // The Magic Store read has the Magic Store fields; use its copy of the product.
      if (row) Object.assign(row, { product: e.product, store: e });
      else byId.set(e.product.id, { product: e.product, shop: null, store: e });
    }
    return { ok: true, rows: [...byId.values()], themes, magicCollection: store.collection?.handle ?? null };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

export async function productRow(legacyId: string): Promise<{ ok: true; row: ProductRow | null; rows: ProductRow[]; themes: ImagenTheme[] | null } | { ok: false; error: string }> {
  const r = await productRows();
  if (!r.ok) return r;
  return { ok: true, row: r.rows.find((x) => x.product.legacyId === legacyId) ?? null, rows: r.rows, themes: r.themes };
}

// ---------- Saving one product's shared and Magic Store fields ----------

const productField = <K extends ProductFieldKey>(k: K) => (PRODUCT_FIELDS[k] as unknown as ProductFieldDef<unknown>).schema;
const GENERATION_KEYS = ["photos", "name_max", "photo_tips", "subject", "images_to_show", "step_labels"] as const;

/** A field set to null is cleared (the store default applies again); a field left out isn't touched. */
export const storeFieldsSchema = z.object({
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/),
  fields: z
    .object({
      short_description: (productField("short_description") as z.ZodString).nullable().optional(),
      imagen_theme: (productField("imagen_theme") as z.ZodString).nullable().optional(),
      related: (productField("related") as z.ZodType<string[]>).nullable().optional(),
      open_store_related: z.boolean().nullable().optional(),
      details: (productField("details") as z.ZodString).nullable().optional(),
      generation: z
        .object({
          photos: productField("photos").nullable().optional(),
          name_max: productField("name_max").nullable().optional(),
          photo_tips: productField("photo_tips").nullable().optional(),
          subject: productField("subject").nullable().optional(),
          images_to_show: productField("images_to_show").nullable().optional(),
          step_labels: productField("step_labels").nullable().optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .default({}),
  variants: z
    .array(
      z
        .object({
          variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/),
          badge: (productField("badge") as z.ZodString).nullable().optional(),
          lead_days: (productField("lead_days") as z.ZodString).nullable().optional(),
        })
        .strict(),
    )
    .max(100)
    .default([]),
});
export type StoreFieldsInput = z.infer<typeof storeFieldsSchema>;

const isEmpty = (v: unknown) => v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Saves a product's shared and Magic Store fields: only the ones that changed, set or cleared, in mmp_shop.
 * Magic Store fields only for products in the Magic Store collection; the theme must be in Imagen's list
 * (when it can be read); "more gifts" must be other Magic Store products.
 */
export async function updateStoreFields(actor: { email: string }, input: StoreFieldsInput): Promise<AdminResult> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const all = await productRows();
  if (!all.ok) return { ok: false, status: 502, error: all.error };
  const row = all.rows.find((r) => r.product.id === input.productId);
  if (!row) return { ok: false, status: 404, error: "That product isn't in the Store or Magic Store collection." };
  const f = input.fields;
  const p = row.product;
  const magicKeys = (["imagen_theme", "related", "open_store_related", "details", "generation"] as const).filter((k) => f[k] !== undefined);
  if ((magicKeys.length || input.variants.length) && !row.store) return { ok: false, status: 400, error: "Not in the Magic Store collection. Add it in Shopify to sell it there." };
  if (f.imagen_theme && all.themes) {
    const t = all.themes.find((x) => x.slug === f.imagen_theme);
    if (!t) return { ok: false, status: 400, error: `“${f.imagen_theme}” isn't one of Imagen's themes.` };
    if (!t.active) return { ok: false, status: 400, error: `“${f.imagen_theme}” isn't active in Imagen.` };
  }
  if (f.related?.length) {
    const magic = new Set(all.rows.filter((r) => r.store).map((r) => r.product.id));
    const bad = f.related.filter((id) => id === p.id || !magic.has(id));
    if (bad.length) return { ok: false, status: 400, error: "More gifts must be other products in the Magic Store collection." };
  }

  const change: ProductMetafieldChange = { set: [], clear: [] };
  const changed: string[] = [];
  const put = (key: string, type: string, now: unknown, next: unknown, encode: (v: unknown) => string) => {
    if (next === undefined) return;
    const same = JSON.stringify(isEmpty(now) ? null : now) === JSON.stringify(isEmpty(next) ? null : next);
    if (same) return;
    changed.push(key);
    if (isEmpty(next)) change.clear.push(key);
    else change.set.push({ key, type, value: encode(next) });
  };
  const str = (v: unknown) => String(v);
  put("short_description", "multi_line_text_field", p.shortDescription ?? null, f.short_description, str);
  put("imagen_theme", "single_line_text_field", p.store?.imagenTheme ?? null, f.imagen_theme, str);
  put("related", "list.product_reference", p.store?.related ?? [], f.related, (v) => JSON.stringify(v));
  put("open_store_related", "boolean", p.store?.relatedOnly === "true" ? true : p.store?.relatedOnly === "false" ? false : null, f.open_store_related === false ? null : f.open_store_related, (v) => String(v));
  put("details", "multi_line_text_field", p.store?.details ?? null, f.details, str);

  if (f.generation) {
    // Merge into the stored JSON, keeping keys this page doesn't edit; a bad stored JSON is replaced.
    const g = parseGeneration(p.store?.generation);
    const now = g.ok ? g.value : {};
    const next: Record<string, unknown> = { ...now };
    for (const k of GENERATION_KEYS) {
      const v = f.generation[k];
      if (v === undefined) continue;
      if (isEmpty(v)) delete next[k];
      else next[k] = v;
    }
    const before = g.ok ? now : { invalid: true };
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      changed.push(...GENERATION_KEYS.filter((k) => JSON.stringify(now[k] ?? null) !== JSON.stringify(next[k] ?? null)).map((k) => `generation.${k}`));
      if (!Object.keys(next).length) change.clear.push("generation");
      else change.set.push({ key: "generation", type: "json", value: JSON.stringify(next) });
    }
  }

  const variantChanges: VariantRuleChange[] = [];
  for (const v of input.variants) {
    const variant = p.variants.find((x) => x.id === v.variantId);
    if (!variant) return { ok: false, status: 400, error: "A size isn't on this product." };
    const c: VariantRuleChange = { variantId: v.variantId, set: [], clear: [] };
    for (const key of ["badge", "lead_days"] as const) {
      const next = v[key];
      if (next === undefined) continue;
      const now = variant.metafields.find((m) => m.key === key)?.value?.trim() || null;
      if ((now ?? null) === (isEmpty(next) ? null : next)) continue;
      if (!changed.includes(key)) changed.push(key);
      if (isEmpty(next)) c.clear.push(key);
      else c.set.push({ key, type: "single_line_text_field", value: next! });
    }
    if (c.set.length || c.clear.length) variantChanges.push(c);
  }

  if (!change.set.length && !change.clear.length && !variantChanges.length) return { ok: true };
  const src = await getShopCatalogSource();
  if (change.set.length || change.clear.length) {
    const r = await src.setProductMetafields(p.id, ns, change);
    if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  }
  if (variantChanges.length) {
    const r = await src.setVariantRules(p.id, ns, variantChanges);
    if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  }
  await invalidateCatalog();
  await track("admin_shop_product_updated", { product_id: p.legacyId, fields: changed }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

// ---------- Refresh themes from Imagen ----------

/** Copies Imagen's active theme slugs into the `mmp_shop.imagen_theme` dropdown, keeping any a product still uses. */
export async function refreshThemes(actor: { email: string }): Promise<AdminResult & { themes?: number; added?: number; removed?: number }> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const themes = await imagenThemes({ fresh: true });
  if (!themes) return { ok: false, status: 502, error: "Couldn't read Imagen's theme list just now." };
  const src = await getShopCatalogSource();
  const defs = await src.fieldDefinitions(ns);
  const before = defs.find((d) => d.ownerType === "PRODUCT" && d.key === "imagen_theme")?.choices ?? [];
  const store = await getStoreCatalog({ fresh: true });
  const inUse = store.entries.map((e) => e.product.store?.imagenTheme).filter((t): t is string => Boolean(t));
  const choices = [...new Set([...themes.filter((t) => t.active).map((t) => t.slug), ...inUse])].sort();
  const r = await src.setThemeChoices(ns, choices);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  await invalidateCatalog();
  const added = choices.filter((c) => !before.includes(c)).length;
  const removed = before.filter((c) => !choices.includes(c)).length;
  await track("admin_open_store_themes_refreshed", { themes: choices.length, added, removed }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true, themes: choices.length, added, removed };
}
