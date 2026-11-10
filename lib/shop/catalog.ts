import { normalisePage } from "./fields";
import { parseVariantRules, type RuleDefaults, type VariantRules } from "./rules";
import type { ShopProduct, ShopVariant } from "./sources/types";

/** Why a product in the Store collection isn't shown in the shop (Settings › Shop lists these). */
export const HIDDEN_REASONS = ["not_active", "no_page", "sold_out", "no_rules", "no_template"] as const;
export type HiddenReason = (typeof HIDDEN_REASONS)[number];

export const HIDDEN_REASON_TEXT: Record<HiddenReason, string> = {
  not_active: "Not active in Shopify",
  no_page: "No page set (Gifts, Products or All)",
  sold_out: "No size Shopify marks as available for sale",
  no_rules: "No size has its print rules (maker, maker's code, print area)",
  no_template: "No preview template yet",
};

export type SellableVariant = { variant: ShopVariant; rules: VariantRules };

export type CatalogEntry = {
  product: ShopProduct;
  page: "gifts" | "products" | "all" | null;
  /** Variants that are for sale and have valid rules (fit to a picture is checked later, per image). */
  sellable: SellableVariant[];
  hidden: HiddenReason[];
  /** Not hiding, but worth fixing, e.g. one size with no rules. */
  warnings: string[];
};

/** A template is usable once it's a JSON object (its shape is checked by the preview module). */
export function templateUsable(t: ShopProduct["template"]): boolean {
  if (!t?.value) return false;
  try {
    const v = JSON.parse(t.value) as unknown;
    return Boolean(v) && typeof v === "object" && !Array.isArray(v);
  } catch {
    return false;
  }
}

/** Pure: what the shop may show from one product, and why not when it can't. */
export function evaluateProduct(p: ShopProduct, defaults?: RuleDefaults): CatalogEntry {
  const hidden: HiddenReason[] = [];
  const warnings: string[] = [];
  const page = normalisePage(p.page);
  if (p.status !== "ACTIVE") hidden.push("not_active");
  if (!page) hidden.push("no_page");
  if (p.page && !page) warnings.push(`Page "${p.page}" isn't Gifts, Products or All`);

  const available = p.variants.filter((v) => v.availableForSale);
  if (!available.length) hidden.push("sold_out");

  const sellable: SellableVariant[] = [];
  for (const v of available) {
    const r = parseVariantRules(v.metafields, defaults);
    if (r.ok) sellable.push({ variant: v, rules: r.rules });
    else {
      const parts = [r.missing.length ? `missing ${r.missing.join(", ")}` : "", r.invalid.length ? `invalid ${r.invalid.join(", ")}` : ""].filter(Boolean).join("; ");
      warnings.push(`${v.title}: ${parts}`);
    }
  }
  if (available.length && !sellable.length) hidden.push("no_rules");
  if (!templateUsable(p.template)) hidden.push("no_template");
  if (!p.productType.trim() && (page === "products" || page === "all")) warnings.push("No product type, so the Products page can't group it");
  return { product: p, page, sellable, hidden, warnings };
}

export function evaluateCatalog(products: ShopProduct[], defaults?: RuleDefaults): CatalogEntry[] {
  return [...products].sort((a, b) => a.position - b.position).map((p) => evaluateProduct(p, defaults));
}

/** Products a page may show, in the collection's order. A product set to All is on both pages. */
export function forPage(entries: CatalogEntry[], page: "gifts" | "products"): CatalogEntry[] {
  return entries.filter((e) => !e.hidden.length && (e.page === page || e.page === "all"));
}
