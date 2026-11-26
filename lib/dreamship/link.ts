import "server-only";
import { z } from "zod";
import { allSyncReports, saveSyncReport, syncReportFor } from "@/lib/db/printers";
import { recentPictureSize } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import { adminProducts, invalidateCatalog } from "@/lib/shop";
import { fieldSpecs } from "@/lib/shop/fields";
import { getShopCatalogSource } from "@/lib/shop/sources";
import type { ShopProduct, VariantRuleChange } from "@/lib/shop/sources/types";
import { designerUrl, getDreamship, type DreamshipSource } from "@/lib/sources/dreamship";
import { track } from "@/lib/track";
import { looksLikeDreamship, parseDreamshipProductId, proposeSync, type SyncReport } from "./sync";

/**
 * The Dreamship card on a Settings › Shop product (docs/dreamship.md › Part A). Reads Dreamship; writes only
 * `mmp_shop` metafields through the shop's own path (CLAUDE.md allowed write 5). The daily run never writes.
 */

export type DreamshipCard = {
  productId: string;
  legacyId: string;
  linkedId: number | null;
  designer: string | null;
  /** A suggested Dreamship product id, when every size's SKU is a Dreamship variant of one product. */
  suggestion: number | null;
  report: SyncReport | null;
  lastSync: { at: string; by: string } | null;
  error: string | null;
  salePct: number;
};

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

async function productByLegacy(legacyId: string): Promise<ShopProduct | null> {
  return (await adminProducts()).find((p) => p.legacyId === legacyId) ?? null;
}

/** Proposes and checks one product against Dreamship (no writes). */
export async function reportFor(p: ShopProduct, dreamshipProductId: number, source?: DreamshipSource): Promise<SyncReport | { error: string }> {
  const ds = source ?? (await getDreamship());
  const product = await ds.product(dreamshipProductId);
  if (!product) return { error: "Dreamship has no product with that id for this account." };
  const [item, s, picture] = await Promise.all([ds.catalogItem(product.itemId), getSettings(["dreamship.sale_pct", "dreamship.min_margin_pct"] as const), p.store?.imagenTheme ? recentPictureSize(p.store.imagenTheme) : Promise.resolve(null)]);
  return proposeSync({ shopify: p, dreamship: product, item, salePct: s["dreamship.sale_pct"], minMarginPct: s["dreamship.min_margin_pct"], picture });
}

/** The Dreamship product a Shopify product was published from: listed on it, or owning one of its SKUs. */
export async function findDreamshipProduct(p: ShopProduct, source?: DreamshipSource): Promise<number | null> {
  const variantIds = p.variants.flatMap((v) => (/^\d{5,12}$/.test((v.sku ?? "").trim()) ? [Number(v.sku)] : []));
  return (source ?? (await getDreamship())).findProduct({ shopifyProductId: p.legacyId, variantIds });
}

async function store(report: SyncReport, by: string) {
  await saveSyncReport({ product_id: report.productId, legacy_id: report.legacyId, dreamship_product_id: report.dreamshipProductId, report, warnings: report.flags.length, differs: report.fieldsChanged, synced_by: by });
}

export async function dreamshipCard(legacyId: string, opts: { sync?: boolean } = {}): Promise<DreamshipCard | null> {
  const p = await productByLegacy(legacyId);
  if (!p) return null;
  const salePct = (await getSettings(["dreamship.sale_pct"] as const))["dreamship.sale_pct"];
  const linkedId = p.dreamshipProductId ? Number(p.dreamshipProductId) || null : null;
  const last = await syncReportFor(p.id);
  const card: DreamshipCard = { productId: p.id, legacyId, linkedId, designer: linkedId ? designerUrl(linkedId) : null, suggestion: null, report: last ? (last.report as SyncReport) : null, lastSync: last ? { at: last.synced_at, by: last.synced_by } : null, error: null, salePct };
  try {
    if (!linkedId) {
      card.suggestion = await findDreamshipProduct(p);
    } else if (opts.sync) {
      const r = await reportFor(p, linkedId);
      if ("error" in r) card.error = r.error;
      else card.report = r;
    }
  } catch (e) {
    card.error = `Couldn't read Dreamship: ${(e as Error).message.slice(0, 120)}`;
  }
  return card;
}

export const linkSchema = z.object({ productId: z.string().regex(/^\d{1,20}$/), dreamship: z.string().trim().min(1).max(200) });

/** Link: `mmp_shop.dreamship_product_id`, after checking Dreamship has that product. */
export async function linkProduct(actor: { email: string }, input: z.infer<typeof linkSchema>): Promise<{ ok: true; dreamshipProductId: number } | Fail> {
  const id = parseDreamshipProductId(input.dreamship);
  if (!id) return fail(400, "Paste the Dreamship product id or its designer link.");
  const p = await productByLegacy(input.productId);
  if (!p) return fail(404, "That product isn't in the Store or Magic Store collection.");
  let exists = false;
  try {
    exists = Boolean(await (await getDreamship()).product(id));
  } catch (e) {
    return fail(502, `Couldn't read Dreamship: ${(e as Error).message.slice(0, 120)}`);
  }
  if (!exists) return fail(404, "Dreamship has no product with that id for this account.");
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const r = await (await getShopCatalogSource()).setProductMetafields(p.id, ns, { set: [{ key: "dreamship_product_id", type: "number_integer", value: String(id) }], clear: [] });
  if (!r.ok) return fail(502, `Shopify refused the change (${r.reason}).`);
  await invalidateCatalog();
  await track("admin_dreamship_linked", { product_id: p.legacyId, fields_changed: 1 }, { email: actor.email, actor: `super_user:${actor.email}` });
  return { ok: true, dreamshipProductId: id };
}

/** Sync from Dreamship (the button): the report with the diff, kept for the Products list. Writes nothing to Shopify. */
export async function syncProduct(actor: { email: string }, legacyId: string): Promise<{ ok: true; report: SyncReport } | Fail> {
  const p = await productByLegacy(legacyId);
  if (!p) return fail(404, "That product isn't in the Store or Magic Store collection.");
  const id = p.dreamshipProductId ? Number(p.dreamshipProductId) : null;
  if (!id) return fail(400, "Link the product to its Dreamship product first.");
  let r;
  try {
    r = await reportFor(p, id);
  } catch (e) {
    return fail(502, `Couldn't read Dreamship: ${(e as Error).message.slice(0, 120)}`);
  }
  if ("error" in r) return fail(404, r.error);
  await store(r, actor.email);
  return { ok: true, report: r };
}

export const saveSchema = z.object({ productId: z.string().regex(/^\d{1,20}$/), variants: z.array(z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d+$/)).max(100).optional() });

/** Writes a report's changes (only what differs, for the sizes picked) through the shop's `metafieldsSet` path. */
async function writeChanges(report: SyncReport, pick: Set<string> | null): Promise<{ ok: true; fieldsChanged: number } | Fail> {
  const types = new Map(fieldSpecs([]).filter((f) => f.ownerType === "PRODUCTVARIANT").map((f) => [f.key, f.type]));
  const changes: VariantRuleChange[] = report.sizes
    .filter((s) => s.changes.length && (!pick || pick.has(s.variantId)))
    .map((s) => ({ variantId: s.variantId, set: s.changes.map((c) => ({ key: c.key, type: types.get(c.key) ?? "single_line_text_field", value: c.to })), clear: [] }));
  const fieldsChanged = changes.reduce((n, c) => n + c.set.length, 0);
  if (!changes.length) return { ok: true, fieldsChanged: 0 };
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const r = await (await getShopCatalogSource()).setVariantRules(report.productId, ns, changes);
  if (!r.ok) return fail(502, `Shopify refused the change (${r.reason}).`);
  return { ok: true, fieldsChanged };
}

/**
 * Save to Shopify: writes only what differs, for the sizes chosen (all by default), through the shop's
 * `metafieldsSet` path (allowed write 5). The proposal is worked out again here, never taken from the browser.
 */
export async function saveSync(actor: { email: string }, input: z.infer<typeof saveSchema>): Promise<{ ok: true; fieldsChanged: number } | Fail> {
  const synced = await syncProduct(actor, input.productId);
  if (!synced.ok) return synced;
  const w = await writeChanges(synced.report, input.variants ? new Set(input.variants) : null);
  if (!w.ok || !w.fieldsChanged) return w;
  await invalidateCatalog();
  await track("admin_dreamship_synced", { product_id: synced.report.legacyId, fields_changed: w.fieldsChanged }, { email: actor.email, actor: `super_user:${actor.email}` });
  // The kept report now matches what's in Shopify.
  await syncProduct(actor, input.productId);
  return w;
}

// ------------------------------------------------------------------------------------- every product at once

/** One product in "Check all Dreamship products". */
export type CheckRow = {
  legacyId: string;
  title: string;
  /** The linked Dreamship product, or the one found for it (`linked` false until Save all links it). */
  dreamshipProductId: number | null;
  linked: boolean;
  status: "up_to_date" | "changes" | "unlinked_found" | "not_found" | "error";
  /** Fields that differ from Dreamship, and the sizes they're on. */
  fieldsChanged: number;
  sizes: { title: string; changes: { key: string; from: string | null; to: string }[] }[];
  flags: string[];
  error: string | null;
};
export type CheckAll = { at: string; rows: CheckRow[]; counts: Record<CheckRow["status"], number> };

/**
 * A product the check looks at: linked to Dreamship, a size made by Dreamship, or every size's SKU shaped like a
 * Dreamship variant id (how Dreamship's Shopify app publishes them). Products made elsewhere are left out.
 */
const isCandidate = (p: ShopProduct) => Boolean(p.dreamshipProductId) || p.variants.some((v) => v.metafields.some((f) => f.key === "maker" && f.value.trim() === "dreamship")) || Boolean(looksLikeDreamship(p));

async function eachLimited<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

async function checkOne(p: ShopProduct, ds: DreamshipSource, by: string): Promise<{ row: CheckRow; report: SyncReport | null }> {
  const linkedId = p.dreamshipProductId ? Number(p.dreamshipProductId) || null : null;
  const row: CheckRow = { legacyId: p.legacyId, title: p.title, dreamshipProductId: linkedId, linked: Boolean(linkedId), status: "not_found", fieldsChanged: 0, sizes: [], flags: [], error: null };
  try {
    const id = linkedId ?? (await findDreamshipProduct(p, ds));
    if (!id) {
      row.error = "No Dreamship product found for it (none is listed on this Shopify product or owns its SKUs).";
      return { row, report: null };
    }
    row.dreamshipProductId = id;
    const r = await reportFor(p, id, ds);
    if ("error" in r) {
      row.status = "error";
      row.error = r.error;
      return { row, report: null };
    }
    // The kept report is for linked products only; a found one is kept once Save all links it.
    if (linkedId) await store(r, by);
    row.status = !linkedId ? "unlinked_found" : r.fieldsChanged ? "changes" : "up_to_date";
    row.fieldsChanged = r.fieldsChanged;
    row.sizes = r.sizes.filter((s) => s.changes.length).map((s) => ({ title: s.title, changes: s.changes }));
    row.flags = r.flags.map((f) => f.text);
    return { row, report: r };
  } catch (e) {
    row.status = "error";
    row.error = `Couldn't read Dreamship: ${(e as Error).message.slice(0, 120)}`;
    return { row, report: null };
  }
}

const countsOf = (rows: CheckRow[]) => {
  const c: CheckAll["counts"] = { up_to_date: 0, changes: 0, unlinked_found: 0, not_found: 0, error: 0 };
  for (const r of rows) c[r.status]++;
  return c;
};

/**
 * Check all Dreamship products (Settings › Printers): every candidate product against Dreamship, finding the Dreamship
 * product for any that isn't linked. Reads only; keeps each linked product's report for the Products lists.
 */
export async function checkAllDreamship(by: string): Promise<CheckAll> {
  const ds = await getDreamship();
  const products = (await adminProducts()).filter(isCandidate);
  const rows = (await eachLimited(products, 4, (p) => checkOne(p, ds, by))).map((x) => x.row);
  return { at: new Date().toISOString(), rows, counts: countsOf(rows) };
}

/**
 * Save all to Shopify: links each product found on Dreamship (`dreamship_product_id`) and writes what differs on
 * every product, worked out again here (allowed write 5). Products with errors are skipped and reported.
 */
export async function saveAllDreamship(actor: { email: string }): Promise<CheckAll & { products: number; fieldsChanged: number; linked: number; failed: number }> {
  const ds = await getDreamship();
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  const catalog = await getShopCatalogSource();
  const products = (await adminProducts()).filter(isCandidate);
  let fieldsChanged = 0;
  let touched = 0;
  let linked = 0;
  let failed = 0;
  await eachLimited(products, 3, async (p) => {
    const { row, report } = await checkOne(p, ds, actor.email);
    if (!report || !row.dreamshipProductId) return;
    let wrote = 0;
    if (!row.linked) {
      const l = await catalog.setProductMetafields(p.id, ns, { set: [{ key: "dreamship_product_id", type: "number_integer", value: String(row.dreamshipProductId) }], clear: [] });
      if (!l.ok) {
        failed++;
        return;
      }
      linked++;
      wrote++;
    }
    const w = await writeChanges(report, null);
    if (!w.ok) {
      failed++;
      return;
    }
    wrote += w.fieldsChanged;
    fieldsChanged += w.fieldsChanged;
    if (wrote) touched++;
  });
  if (touched) await invalidateCatalog();
  await track("admin_dreamship_saved_all", { products: touched, fields_changed: fieldsChanged, linked, failed }, { email: actor.email, actor: `super_user:${actor.email}` });
  // What Shopify holds now, checked again so the list shows it.
  const after = await checkAllDreamship(actor.email);
  return { ...after, products: touched, fieldsChanged, linked, failed };
}

/** The daily run (`/api/cron/dreamship-sync`): reports what differs for every Dreamship product. It never writes to Shopify. */
export async function dailyDreamshipCheck(): Promise<{ checked: number; differing: number; failed: number }> {
  const { counts } = await checkAllDreamship("cron");
  return { checked: counts.up_to_date + counts.changes, differing: counts.changes + counts.unlinked_found, failed: counts.error };
}

/** For Settings › Shop › Products and Settings › Printers: each linked product's last sync, by Shopify product gid. */
export async function syncSummaries(): Promise<Map<string, { warnings: number; differs: number; at: string; dreamshipProductId: number; flags: string[] }>> {
  return new Map((await allSyncReports()).map((r) => [r.product_id, { warnings: r.warnings, differs: r.differs, at: r.synced_at, dreamshipProductId: r.dreamship_product_id, flags: ((r.report as SyncReport).flags ?? []).map((f) => f.text) }]));
}
