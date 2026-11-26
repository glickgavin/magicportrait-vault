import "server-only";
import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/track";
import type { CatalogEntry } from "./catalog";
import { fieldSpecs, IMAGE_KINDS, MAKERS, normalisePage, pageLabel, PLACEMENTS } from "./fields";
import { adminProducts, discountInfo, discountSettingFor, getCatalog, invalidateCatalog } from "./index";
import { getShopCatalogSource } from "./sources";
import type { DiscountInfo, ProductFieldChanges, ShopFieldDefinition, ShopListKey, ShopProduct, VariantRuleChange } from "./sources/types";
import { parseTemplate, templateSchema, type Template } from "./template";

/** Settings › Shop (docs/shop.md). Every write here is CLAUDE.md allowed write 5: `mmp_shop` only. */

export const occasionName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} '&.-]*$/u, "Letters, numbers, spaces and ' & . - only");

export const productUpdateSchema = z
  .object({
    productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/),
    page: z.enum(["gifts", "products", "all", "none"]).optional(),
    occasions: z.array(occasionName).max(30).optional(),
    categories: z.array(occasionName).max(30).optional(),
  })
  .refine((v) => v.page !== undefined || v.occasions !== undefined || v.categories !== undefined, "Nothing to change");

export const occasionsUpdateSchema = z.object({ occasions: z.array(occasionName).min(1).max(30) }).refine((v) => new Set(v.occasions.map((o) => o.toLowerCase())).size === v.occasions.length, "Each occasion once");
export const categoriesUpdateSchema = z.object({ categories: z.array(occasionName).min(1).max(30) }).refine((v) => new Set(v.categories.map((o) => o.toLowerCase())).size === v.categories.length, "Each category once");

export type ShopOverview =
  | {
      ok: true;
      sourceKind: "live" | "fixtures";
      entries: CatalogEntry[];
      definitions: ShopFieldDefinition[];
      missingDefinitions: string[];
      occasions: string[];
      occasionsFromDefinition: boolean;
      /** The Products page categories, in order (the definition's choices, else what products use). */
      categories: string[];
      categoriesFromDefinition: boolean;
      discounts: { normal: { code: string | null; label: string; info: DiscountInfo | null }; vip: { code: string | null; label: string; info: DiscountInfo | null; fallsBack: boolean } };
      collectionId: string;
    }
  | { ok: false; error: string };

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/not configured/.test(m)) return "Shopify isn't configured in this environment.";
  if (/ACCESS_DENIED|access denied|403/i.test(m)) return "The Shopify app is missing a permission this page needs (see Data sources).";
  return "Couldn't read Shopify just now. Try again in a minute.";
}

export async function shopOverview(): Promise<ShopOverview> {
  try {
    const s = await getSettings(["shop.metafield_namespace", "shop.collection_id", "shop.discount_code_vip"] as const);
    const src = await getShopCatalogSource();
    const [entries, definitions] = await Promise.all([getCatalog({ fresh: true }), src.fieldDefinitions(s["shop.metafield_namespace"])]);
    const have = new Set(definitions.map((d) => `${d.ownerType}:${d.key}`));
    const occDef = definitions.find((d) => d.ownerType === "PRODUCT" && d.key === "occasions");
    const inUse = [...new Set(entries.flatMap((e) => e.product.occasions))];
    const occasions = occDef?.choices?.length ? occDef.choices : inUse;
    const catDef = definitions.find((d) => d.ownerType === "PRODUCT" && d.key === "categories");
    const categories = catDef?.choices?.length ? catDef.choices : categoriesInUse(entries);
    const missingDefinitions = fieldSpecs(occasions, categories)
      .map((f) => `${f.ownerType}:${f.key}`)
      .filter((k) => !have.has(k));
    const [n, v] = await Promise.all([discountSettingFor("normal"), discountSettingFor("vip")]);
    const [ni, vi] = await Promise.all([discountInfo(n.code), v.code === n.code ? Promise.resolve(null) : discountInfo(v.code)]);
    return {
      ok: true,
      sourceKind: src.kind,
      entries,
      definitions,
      missingDefinitions,
      occasions,
      occasionsFromDefinition: Boolean(occDef?.choices?.length),
      categories,
      categoriesFromDefinition: Boolean(catDef?.choices?.length),
      discounts: { normal: { ...n, info: ni }, vip: { ...v, info: v.code === n.code ? ni : vi, fallsBack: !s["shop.discount_code_vip"].trim() } },
      collectionId: s["shop.collection_id"],
    };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
}

/** read_online_store_navigation: the Magic Store's category menu (`open_store.menu_handle`). */
export const SHOP_SCOPES = ["read_products", "write_products", "read_discounts", "read_customers", "read_online_store_navigation"] as const;

/** What the shop needs from Shopify, and what this environment has (Settings › Shop › Shopify access). */
export async function shopAccess(): Promise<{ scopes: { scope: string; ok: boolean }[] | null; storefront: boolean; fulfilmentSecret: boolean }> {
  const { env } = await import("@/lib/env");
  let scopes: { scope: string; ok: boolean }[] | null = null;
  try {
    const { getSources } = await import("@/lib/sources");
    const have = (await (await getSources()).shopify.ping()).scopes;
    scopes = SHOP_SCOPES.map((scope) => ({ scope, ok: have.includes(scope) || (scope.startsWith("read_") && have.includes(scope.replace("read_", "write_"))) }));
  } catch {
    scopes = null;
  }
  return { scopes, storefront: env.dataSource === "fixtures" || Boolean(env.optional("SHOPIFY_STOREFRONT_TOKEN") || env.optional("SHOPIFY_STOREFRONT_PRIVATE_TOKEN")), fulfilmentSecret: Boolean(env.optional("SHOP_FULFILMENT_SECRET")) };
}

export type AdminResult = { ok: true } | { ok: false; status: number; error: string };

/** Sets one product's page and/or occasions in Shopify. The product must be in the Store collection. */
export async function updateProductFields(actor: { email: string }, input: z.infer<typeof productUpdateSchema>): Promise<AdminResult> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  let entries: CatalogEntry[];
  try {
    entries = await getCatalog({ fresh: true });
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const entry = entries.find((e) => e.product.id === input.productId);
  if (!entry) return { ok: false, status: 404, error: "That product isn't in the Store collection." };
  const src = await getShopCatalogSource();
  if (input.occasions) {
    const defs = await src.fieldDefinitions(ns);
    const choices = defs.find((d) => d.ownerType === "PRODUCT" && d.key === "occasions")?.choices;
    if (choices?.length) {
      const bad = input.occasions.filter((o) => !choices.includes(o));
      if (bad.length) return { ok: false, status: 400, error: `Not in the occasion list: ${bad.join(", ")}` };
    }
  }
  if (input.categories) {
    const defs = await src.fieldDefinitions(ns);
    const choices = defs.find((d) => d.ownerType === "PRODUCT" && d.key === "categories")?.choices;
    if (choices?.length) {
      const bad = input.categories.filter((o) => !choices.includes(o));
      if (bad.length) return { ok: false, status: 400, error: `Not in the category list: ${bad.join(", ")}` };
    }
  }
  const fields: ProductFieldChanges = {};
  const changed: string[] = [];
  if (input.page !== undefined) {
    const next = input.page === "none" ? null : pageLabel(input.page);
    if (normalisePage(entry.product.page) !== normalisePage(next)) {
      fields.page = next;
      changed.push("page");
    }
  }
  if (input.occasions !== undefined && JSON.stringify(input.occasions) !== JSON.stringify(entry.product.occasions)) {
    fields.occasions = input.occasions;
    changed.push("occasions");
  }
  if (input.categories !== undefined && JSON.stringify(input.categories) !== JSON.stringify(entry.product.categories)) {
    fields.categories = input.categories;
    changed.push("categories");
  }
  if (!changed.length) return { ok: true };
  const r = await src.setProductFields(input.productId, ns, fields);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  await invalidateCatalog();
  await track("admin_shop_product_updated", { product_id: entry.product.legacyId, fields: changed }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

/** The categories products use: their own, else their Shopify product type (how the Products page grouped before). */
export function categoriesInUse(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => (e.product.categories.length ? e.product.categories : e.product.productType.trim() ? [e.product.productType.trim()] : [])))];
}

const LIST_WORDS: Record<ShopListKey, { one: string; event: "admin_shop_occasions_updated" | "admin_shop_categories_updated" }> = {
  occasions: { one: "occasion", event: "admin_shop_occasions_updated" },
  categories: { one: "category", event: "admin_shop_categories_updated" },
};

/** Replaces the occasion or category list (that `mmp_shop` definition's choices), in the order given. */
export async function updateList(actor: { email: string }, key: ShopListKey, list: string[]): Promise<AdminResult & { inUse?: string[] }> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const src = await getShopCatalogSource();
  let before: string[] = [];
  let entries: CatalogEntry[] = [];
  try {
    const defs = await src.fieldDefinitions(ns);
    const def = defs.find((d) => d.ownerType === "PRODUCT" && d.key === key);
    if (!def) return { ok: false, status: 409, error: "Create the shop fields in Shopify first." };
    before = def.choices ?? [];
    entries = await getCatalog({ fresh: true });
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const removed = before.filter((o) => !list.includes(o));
  const inUse = removed.filter((o) => entries.some((e) => e.product[key].includes(o)));
  if (inUse.length) return { ok: false, status: 409, error: `Still used by a product: ${inUse.join(", ")}. Take it off those products first.`, inUse };
  const r = await src.setListChoices(ns, key, list);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  await invalidateCatalog();
  await track(LIST_WORDS[key].event, { count: list.length, added: list.filter((o) => !before.includes(o)).length, removed: removed.length }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

/** The occasion list (kept for the existing route and tests). */
export const updateOccasions = (actor: { email: string }, occasions: string[]) => updateList(actor, "occasions", occasions);

/** Creates whichever `mmp_shop` metafield definitions don't exist yet. Never changes existing ones. */
export async function createMissingFields(actor: { email: string }): Promise<AdminResult & { created?: string[]; failed?: { key: string; reason: string }[] }> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const src = await getShopCatalogSource();
  let have: Set<string>;
  let inUse: string[] = [];
  let categories: string[] = [];
  try {
    have = new Set((await src.fieldDefinitions(ns)).map((d) => `${d.ownerType}:${d.key}`));
    const entries = await getCatalog({ fresh: true });
    inUse = [...new Set(entries.flatMap((e) => e.product.occasions))];
    categories = categoriesInUse(entries);
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  // A new categories field starts with the product types products have now, so nothing regroups by surprise.
  const missing = fieldSpecs(inUse, categories).filter((f) => !have.has(`${f.ownerType}:${f.key}`));
  if (!missing.length) return { ok: true, created: [], failed: [] };
  const r = await src.createFieldDefinitions(ns, missing);
  await invalidateCatalog();
  await track("admin_shop_fields_created", { created: r.created.length, failed: r.failed.length }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true, created: r.created, failed: r.failed };
}

export const templatePublishSchema = z.object({ productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/), template: templateSchema });

/**
 * The template editor's Publish: writes `mmp_shop.template`. The background and overlay must be the
 * product's own Shopify photos (same media id and URL), so a template can't point anywhere else.
 */
export async function publishTemplate(actor: { email: string }, input: { productId: string; template: Template }): Promise<AdminResult> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  let products: ShopProduct[];
  try {
    products = await adminProducts();
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const found = products.find((p) => p.id === input.productId);
  if (!found) return { ok: false, status: 404, error: "That product isn't in the Store or Magic Store collection." };
  const entry = { product: found };
  if (input.template.overlay && input.template.overlay.media_id === input.template.background.media_id) {
    return { ok: false, status: 422, error: "The overlay is the same photo as the background, so it would cover the customer's picture. Choose no overlay." };
  }
  // Photos allowed: the product's own, the ones its saved template already uses (studio photos kept
  // in Shopify Files, so they stay out of the product's gallery), and photos uploaded for it in the editor.
  // Nothing else, so no outside image can be set here.
  const allowed = new Map(entry.product.media.map((m) => [m.id, m.url]));
  const saved = parseTemplate(entry.product.template?.value);
  for (const m of [saved?.background, saved?.overlay]) if (m) allowed.set(m.media_id, m.url);
  const { uploadedTemplateMedia } = await import("./template-media");
  for (const m of await uploadedTemplateMedia(entry.product.legacyId)) allowed.set(m.id, m.url);
  for (const s of Object.values(saved?.scenes?.values ?? {})) for (const m of [s.background, s.overlay]) if (m) allowed.set(m.media_id, m.url);
  const scenePhotos = Object.values(input.template.scenes?.values ?? {}).flatMap((s) => [["photo for an option", s.background], ["overlay for an option", s.overlay]] as const);
  for (const [what, m] of [["background", input.template.background], ["overlay", input.template.overlay], ...scenePhotos] as const) {
    if (!m) continue;
    if (allowed.get(m.media_id) !== m.url) return { ok: false, status: 400, error: `The ${what} must be one of this product's photos in Shopify, one uploaded for it here, or the one its template already uses.` };
  }
  // The layer's pictures must be in the art library: live ones, or archived ones this product already offered.
  const choices = input.template.layer?.art?.choices ?? [];
  if (choices.length) {
    const { layerArtByIds } = await import("./layer-art");
    const found = await layerArtByIds(choices);
    const kept = new Set(saved?.layer?.art?.choices ?? []);
    if (found.length !== choices.length || found.some((a) => a.archived && !kept.has(a.id))) return { ok: false, status: 400, error: "The layer's pictures must be in the art library (and not archived)." };
  }
  const t: Template = { ...input.template, updated_at: new Date().toISOString() };
  const r = await (await getShopCatalogSource()).setProductTemplate(input.productId, ns, JSON.stringify(t));
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the template (${r.reason}).` };
  await invalidateCatalog();
  await track("admin_shop_template_published", { product_id: entry.product.legacyId, zone: t.zone.kind, layer: Boolean(t.layer?.enabled), layer_texts: t.layer?.texts.length ?? 0, layer_art: t.layer?.art?.choices.length ?? 0 }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

/** The print rules Settings › Shop › Print rules edits; `background` and `extra` are left as they are. */
export const RULE_KEYS = ["maker", "maker_sku", "print_px", "placement", "zone_px", "min_short_side_px", "max_crop_pct", "adjustable", "image_kinds"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

const px = z.string().trim().regex(/^(\d{2,5}x\d{2,5})?$/i, "Width x height in pixels, e.g. 2400x3000");
const intIn = (min: number, max: number) => z.string().trim().regex(/^(\d{1,6})?$/, "A whole number").refine((v) => v === "" || (Number(v) >= min && Number(v) <= max), `Between ${min} and ${max}`);

/** "" clears a rule (optional ones fall back to their defaults; a size without the required three is hidden). */
export const variantRulesSchema = z.object({
  maker: z.enum(["", ...MAKERS]),
  maker_sku: z.string().trim().max(200).regex(/^[^\s<>"'`]*$/, "No spaces or quotes"),
  print_px: px,
  placement: z.enum(["", ...PLACEMENTS]),
  zone_px: px,
  min_short_side_px: intIn(100, 20000),
  max_crop_pct: intIn(0, 90),
  adjustable: z.enum(["", "true", "false"]),
  image_kinds: z.enum(["", ...IMAGE_KINDS]),
});
export type VariantRulesInput = z.infer<typeof variantRulesSchema>;

export const rulesUpdateSchema = z.object({
  productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d{1,20}$/),
  variants: z.array(z.object({ variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/), rules: variantRulesSchema })).min(1).max(100),
});

/** A size's rules as the editor shows them ("" when unset). */
export function rulesFor(metafields: { key: string; value: string }[]): VariantRulesInput {
  const m = new Map(metafields.map((f) => [f.key, f.value.trim()]));
  return Object.fromEntries(RULE_KEYS.map((k) => [k, k === "maker" || k === "placement" || k === "image_kinds" ? (m.get(k) ?? "").toLowerCase() : (m.get(k) ?? "")])) as VariantRulesInput;
}

/** Saves the print rules of a Store product's sizes: only what changed, set or cleared, in mmp_shop. */
export async function updateVariantRules(actor: { email: string }, input: z.infer<typeof rulesUpdateSchema>): Promise<AdminResult> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  let products: ShopProduct[];
  try {
    products = await adminProducts();
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const found = products.find((p) => p.id === input.productId);
  if (!found) return { ok: false, status: 404, error: "That product isn't in the Store or Magic Store collection." };
  const entry = { product: found };
  const types = new Map(fieldSpecs([]).filter((f) => f.ownerType === "PRODUCTVARIANT").map((f) => [f.key, f.type]));
  const changes: VariantRuleChange[] = [];
  const changedKeys = new Set<string>();
  for (const v of input.variants) {
    const variant = entry.product.variants.find((x) => x.id === v.variantId);
    if (!variant) return { ok: false, status: 400, error: "A size isn't on this product." };
    const now = rulesFor(variant.metafields);
    const next = { ...v.rules, print_px: v.rules.print_px.toLowerCase(), zone_px: v.rules.zone_px.toLowerCase() };
    const set: VariantRuleChange["set"] = [];
    const clear: string[] = [];
    for (const k of RULE_KEYS) {
      if (next[k] === now[k]) continue;
      changedKeys.add(k);
      if (next[k] === "") clear.push(k);
      else set.push({ key: k, type: types.get(k) ?? "single_line_text_field", value: next[k] });
    }
    if (set.length || clear.length) changes.push({ variantId: v.variantId, set, clear });
  }
  if (!changes.length) return { ok: true };
  const r = await (await getShopCatalogSource()).setVariantRules(input.productId, ns, changes);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  await invalidateCatalog();
  await track("admin_shop_rules_updated", { product_id: entry.product.legacyId, sizes: changes.length, fields: [...changedKeys] }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}
