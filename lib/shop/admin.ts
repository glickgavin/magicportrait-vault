import "server-only";
import { z } from "zod";
import { getSettings } from "@/lib/settings";
import { track } from "@/lib/track";
import type { CatalogEntry } from "./catalog";
import { fieldSpecs, normalisePage, pageLabel } from "./fields";
import { discountInfo, discountSettingFor, getCatalog, invalidateCatalog } from "./index";
import { getShopCatalogSource } from "./sources";
import type { DiscountInfo, ShopFieldDefinition } from "./sources/types";

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
  })
  .refine((v) => v.page !== undefined || v.occasions !== undefined, "Nothing to change");

export const occasionsUpdateSchema = z.object({ occasions: z.array(occasionName).min(1).max(30) }).refine((v) => new Set(v.occasions.map((o) => o.toLowerCase())).size === v.occasions.length, "Each occasion once");

export type ShopOverview =
  | {
      ok: true;
      sourceKind: "live" | "fixtures";
      entries: CatalogEntry[];
      definitions: ShopFieldDefinition[];
      missingDefinitions: string[];
      occasions: string[];
      occasionsFromDefinition: boolean;
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
    const missingDefinitions = fieldSpecs(occasions)
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
      discounts: { normal: { ...n, info: ni }, vip: { ...v, info: v.code === n.code ? ni : vi, fallsBack: !s["shop.discount_code_vip"].trim() } },
      collectionId: s["shop.collection_id"],
    };
  } catch (e) {
    return { ok: false, error: errorText(e) };
  }
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
  const fields: { page?: string | null; occasions?: string[] } = {};
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
  if (!changed.length) return { ok: true };
  const r = await src.setProductFields(input.productId, ns, fields);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  invalidateCatalog();
  await track("admin_shop_product_updated", { product_id: entry.product.legacyId, fields: changed }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

/** Replaces the occasion list (the `mmp_shop.occasions` definition's choices), in the order given. */
export async function updateOccasions(actor: { email: string }, occasions: string[]): Promise<AdminResult & { inUse?: string[] }> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const src = await getShopCatalogSource();
  let before: string[] = [];
  let entries: CatalogEntry[] = [];
  try {
    const defs = await src.fieldDefinitions(ns);
    const def = defs.find((d) => d.ownerType === "PRODUCT" && d.key === "occasions");
    if (!def) return { ok: false, status: 409, error: "Create the shop fields in Shopify first." };
    before = def.choices ?? [];
    entries = await getCatalog({ fresh: true });
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const removed = before.filter((o) => !occasions.includes(o));
  const inUse = removed.filter((o) => entries.some((e) => e.product.occasions.includes(o)));
  if (inUse.length) return { ok: false, status: 409, error: `Still used by a product: ${inUse.join(", ")}. Take it off those products first.`, inUse };
  const r = await src.setOccasionChoices(ns, occasions);
  if (!r.ok) return { ok: false, status: 502, error: `Shopify refused the change (${r.reason}).` };
  invalidateCatalog();
  await track("admin_shop_occasions_updated", { count: occasions.length, added: occasions.filter((o) => !before.includes(o)).length, removed: removed.length }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true };
}

/** Creates whichever `mmp_shop` metafield definitions don't exist yet. Never changes existing ones. */
export async function createMissingFields(actor: { email: string }): Promise<AdminResult & { created?: string[]; failed?: { key: string; reason: string }[] }> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const src = await getShopCatalogSource();
  let have: Set<string>;
  let inUse: string[] = [];
  try {
    have = new Set((await src.fieldDefinitions(ns)).map((d) => `${d.ownerType}:${d.key}`));
    inUse = [...new Set((await getCatalog({ fresh: true })).flatMap((e) => e.product.occasions))];
  } catch (e) {
    return { ok: false, status: 502, error: errorText(e) };
  }
  const missing = fieldSpecs(inUse).filter((f) => !have.has(`${f.ownerType}:${f.key}`));
  if (!missing.length) return { ok: true, created: [], failed: [] };
  const r = await src.createFieldDefinitions(ns, missing);
  invalidateCatalog();
  await track("admin_shop_fields_created", { created: r.created.length, failed: r.failed.length }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true, created: r.created, failed: r.failed };
}
