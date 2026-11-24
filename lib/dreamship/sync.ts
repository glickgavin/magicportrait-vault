import type { ShopProduct } from "@/lib/shop/sources/types";
import type { DreamshipCatalogItem, DreamshipProduct } from "@/lib/sources/dreamship";

/**
 * Link and sync (docs/dreamship.md › Part A), pure: match Shopify sizes to Dreamship variants by SKU (= Dreamship's
 * product variant id), propose each size's print rules from Dreamship, and work out cost, margin, dpi and the flags.
 * Saving writes only what changed (lib/dreamship/link.ts); this never writes.
 */

/** The `mmp_shop` variant fields a sync may propose. */
export const SYNC_KEYS = ["maker", "maker_sku", "print_px", "extra", "lead_days"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

export type SizeChange = { key: SyncKey; from: string | null; to: string };

export type SizeReport = {
  variantId: string;
  legacyId: string;
  title: string;
  sku: string | null;
  /** The Dreamship product variant this size is (SKU match); null when there's none. */
  dreamshipVariantId: number | null;
  printArea: string | null;
  proposed: Partial<Record<SyncKey, string>>;
  changes: SizeChange[];
  price: number | null;
  cost: number | null;
  /** Profit share at full price, % (null without a cost). */
  marginPct: number | null;
  /** Profit in money at the sale price (price less dreamship.sale_pct) less cost. */
  saleProfit: number | null;
  /** The theme's pictures on this size, in dots per inch, against Dreamship's minimum. */
  dpi: number | null;
  minDpi: number | null;
  aiUpscale: boolean | null;
};

export type FlagKind = "size_without_dreamship" | "dreamship_without_size" | "cost_at_or_above_price" | "loss_at_sale" | "low_margin" | "below_min_dpi" | "template_photo_missing" | "not_found";
export type Flag = { kind: FlagKind; size: string | null; text: string };

export type SyncReport = {
  productId: string;
  legacyId: string;
  dreamshipProductId: number;
  sizes: SizeReport[];
  /** Dreamship variants no Shopify size uses. */
  unmatched: { productVariantId: number; size: string | null }[];
  flags: Flag[];
  fieldsChanged: number;
};

/** '8x10"' → "8x10"; "24 x 36 in" → "24x36". */
export function areaKeyForSize(size: string | null | undefined): string | null {
  const m = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i.exec(size ?? "");
  return m ? `${m[1]}x${m[2]}` : null;
}

/** The product id from a pasted id or a designer link (…/app/products/9972256). */
export function parseDreamshipProductId(input: string): number | null {
  const s = input.trim();
  const m = /^(\d{1,12})$/.exec(s) ?? /dreamship\.com\/app\/products\/(\d{1,12})/i.exec(s);
  return m ? Number(m[1]) : null;
}

const money = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : n;
};
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * The dpi a picture of `pic` pixels prints at when it covers a print area. Dreamship rates dpi against the size's
 * own inches (an "8x10" area is 8 × 10 in, whatever the file's pixels), so the inches come from the key when it
 * names them, else from the area's pixels at its dpi (300 by default). Covering, the tighter side decides.
 */
export function coverDpi(pic: { width: number; height: number }, area: { key?: string; widthPx: number; heightPx: number; dpi?: number | null }): number {
  const named = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(area.key ?? "");
  let inW = named ? Number(named[1]) : area.widthPx / (area.dpi || 300);
  let inH = named ? Number(named[2]) : area.heightPx / (area.dpi || 300);
  // A named size follows the file's orientation ("8x10" on a portrait file is 8 wide, 10 tall).
  if (named && (inW > inH) !== (area.widthPx > area.heightPx)) [inW, inH] = [inH, inW];
  return Math.round(Math.min(pic.width / inW, pic.height / inH));
}

function sameExtra(a: string | null, b: string): boolean {
  if (a == null) return false;
  try {
    const x = JSON.parse(a) as Record<string, unknown>;
    const y = JSON.parse(b) as Record<string, unknown>;
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    return [...keys].every((k) => JSON.stringify(x[k]) === JSON.stringify(y[k]));
  } catch {
    return false;
  }
}

export function proposeSync(input: {
  shopify: ShopProduct;
  dreamship: DreamshipProduct;
  item: DreamshipCatalogItem | null;
  salePct: number;
  minMarginPct: number;
  /** A picture the product's Imagen theme made (its size), or null when none is known yet. */
  picture: { width: number; height: number } | null;
}): SyncReport {
  const { shopify: p, dreamship: d, item } = input;
  const flags: Flag[] = [];
  const used = new Set<number>();
  const sizes: SizeReport[] = p.variants.map((v) => {
    const dv = d.variants.find((x) => String(x.productVariantId) === (v.sku ?? "").trim()) ?? null;
    const meta = (k: string) => v.metafields.find((f) => f.key === k)?.value ?? null;
    const base: SizeReport = { variantId: v.id, legacyId: v.legacyId, title: v.title, sku: v.sku, dreamshipVariantId: dv?.productVariantId ?? null, printArea: null, proposed: {}, changes: [], price: money(v.price), cost: null, marginPct: null, saleProfit: null, dpi: null, minDpi: null, aiUpscale: null };
    if (!dv) {
      flags.push({ kind: "size_without_dreamship", size: v.title, text: `${v.title} has no Dreamship variant (its SKU isn't one of the product's variant ids).` });
      return base;
    }
    used.add(dv.productVariantId);
    const key = areaKeyForSize(dv.size);
    const area = (key && (item?.printAreas.find((a) => a.key === key) ?? d.printAreas.find((a) => a.key === key))) || null;
    const designArea = key ? (d.printAreas.find((a) => a.key === key) ?? null) : null;
    const proposed: SizeReport["proposed"] = { maker: "dreamship", maker_sku: String(dv.itemVariantId) };
    if (area) proposed.print_px = `${area.widthPx}x${area.heightPx}`;
    if (key) proposed.extra = JSON.stringify({ item_id: d.itemId, print_area: key, product_variant_id: dv.productVariantId });
    if (item?.productionDaysMin != null && item.productionDaysMax != null) proposed.lead_days = `${Math.floor(item.productionDaysMin)}-${Math.ceil(item.productionDaysMax)}`;
    const changes: SizeChange[] = [];
    for (const k of SYNC_KEYS) {
      const to = proposed[k];
      if (to == null) continue;
      const from = meta(k);
      const same = k === "extra" ? sameExtra(from, to) : (from ?? "").trim().toLowerCase() === to.toLowerCase();
      if (!same) changes.push({ key: k, from, to });
    }
    const price = money(v.price);
    const cost = money(dv.cost);
    const marginPct = price && cost != null ? round(((price - cost) / price) * 100) : null;
    const saleProfit = price != null && cost != null ? round(price * (1 - input.salePct / 100) - cost, 2) : null;
    const dpi = input.picture && area ? coverDpi(input.picture, area) : null;
    const minDpi = area?.minDpi ?? designArea?.minDpi ?? null;
    if (price != null && cost != null && cost >= price) flags.push({ kind: "cost_at_or_above_price", size: v.title, text: `${v.title} costs $${cost.toFixed(2)} at Dreamship and sells for $${price.toFixed(2)}.` });
    else if (saleProfit != null && saleProfit < 0) flags.push({ kind: "loss_at_sale", size: v.title, text: `${v.title} loses $${Math.abs(saleProfit).toFixed(2)} at ${input.salePct}% off.` });
    else if (marginPct != null && marginPct < input.minMarginPct) flags.push({ kind: "low_margin", size: v.title, text: `${v.title} makes ${marginPct}%, below ${input.minMarginPct}%.` });
    if (dpi != null && minDpi != null && dpi < minDpi) flags.push({ kind: "below_min_dpi", size: v.title, text: `${v.title} prints the theme's pictures at about ${dpi} dpi; Dreamship asks for ${minDpi}.` });
    return { ...base, printArea: key, proposed, changes, cost, marginPct, saleProfit, dpi, minDpi, aiUpscale: designArea ? designArea.aiUpscale : null };
  });
  const unmatched = d.variants.filter((x) => !used.has(x.productVariantId)).map((x) => ({ productVariantId: x.productVariantId, size: x.size }));
  for (const u of unmatched) flags.push({ kind: "dreamship_without_size", size: u.size, text: `Dreamship's ${u.size ?? u.productVariantId} has no size in Shopify.` });
  // Dreamship's listing updates can replace the Shopify photos, and with them the template's background.
  const bg = templateBackground(p.template?.value ?? null);
  if (bg && p.media.length && !p.media.some((m) => sameImage(m.url, bg))) flags.push({ kind: "template_photo_missing", size: null, text: "The preview template's photo is no longer among the product's photos (Dreamship may have replaced them)." });
  return { productId: p.id, legacyId: p.legacyId, dreamshipProductId: d.id, sizes, unmatched, flags, fieldsChanged: sizes.reduce((n, s) => n + s.changes.length, 0) };
}

function templateBackground(value: string | null): string | null {
  if (!value) return null;
  try {
    const t = JSON.parse(value) as { background?: { url?: unknown } };
    return typeof t.background?.url === "string" ? t.background.url : null;
  } catch {
    return null;
  }
}

/** Shopify CDN links differ in query strings and size suffixes; the file name decides. */
function sameImage(a: string, b: string): boolean {
  const name = (u: string) => (u.split("?")[0].split("/").pop() ?? "").replace(/_\d+x\d*(?=\.)/, "");
  return name(a) === name(b);
}

/** The link suggestion: every size's SKU looks like a Dreamship product variant id. */
export function looksLikeDreamship(p: ShopProduct): string | null {
  const skus = p.variants.map((v) => (v.sku ?? "").trim());
  return skus.length && skus.every((s) => /^\d{5,12}$/.test(s)) ? skus[0] : null;
}
