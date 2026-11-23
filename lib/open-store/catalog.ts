import { productFieldProblems, readProductField } from "@/lib/settings/product-fields";
import type { SellableVariant } from "@/lib/shop/catalog";
import { parseVariantRules, type RuleDefaults } from "@/lib/shop/rules";
import type { ShopProduct } from "@/lib/shop/sources/types";
import { templateUsable } from "@/lib/shop/catalog";
import type { ImagenTheme } from "@/lib/sources/imagen-api";

/** Why a Magic Store product isn't shown (docs/open-store.md › A product is in the open store). */
export const STORE_HIDDEN_REASONS = ["not_active", "not_published", "sold_out", "no_rules", "no_template", "no_theme", "theme_unavailable"] as const;
export type StoreHiddenReason = (typeof STORE_HIDDEN_REASONS)[number];

export const STORE_HIDDEN_TEXT: Record<StoreHiddenReason, string> = {
  not_active: "Not active in Shopify",
  not_published: "Not published to the Storefront sales channel, so carts can't add it",
  sold_out: "No size Shopify marks as available for sale",
  no_rules: "Not every size has its print rules (maker, maker's code, print area)",
  no_template: "No preview template yet",
  no_theme: "No Imagen theme (or mark it Related only)",
  theme_unavailable: "Its Imagen theme isn't in Imagen's list, or isn't active",
};

export type StoreEntry = {
  product: ShopProduct;
  /** Shown only under "On more gifts", never in the grid. */
  relatedOnly: boolean;
  theme: string | null;
  /** Every size, with its rules (all sizes have rules when nothing is hidden). */
  sellable: SellableVariant[];
  hidden: StoreHiddenReason[];
  /** Not hiding, but worth fixing: bad field values (the store default is used), sizes without rules, … */
  warnings: string[];
};

export type StoreCheckOptions = {
  defaults?: RuleDefaults;
  /** open_store.storefront_publication_id; empty: not checked. */
  publicationId?: string;
  /** Imagen's theme list; null when it couldn't be read (then not checked). */
  themes?: ImagenTheme[] | null;
};

/** Pure: whether a Magic Store collection product is shown in the open store, and why not. */
export function evaluateStoreProduct(p: ShopProduct, opts: StoreCheckOptions = {}): StoreEntry {
  const hidden: StoreHiddenReason[] = [];
  const warnings: string[] = [];
  if (p.status !== "ACTIVE") hidden.push("not_active");
  if (opts.publicationId && !(p.store?.publicationIds ?? []).includes(opts.publicationId)) hidden.push("not_published");
  if (!p.variants.some((v) => v.availableForSale)) hidden.push("sold_out");

  const sellable: SellableVariant[] = [];
  let missingRules = 0;
  for (const v of p.variants) {
    const r = parseVariantRules(v.metafields, opts.defaults);
    if (r.ok) sellable.push({ variant: v, rules: r.rules });
    else {
      missingRules++;
      const parts = [r.missing.length ? `missing ${r.missing.join(", ")}` : "", r.invalid.length ? `invalid ${r.invalid.join(", ")}` : ""].filter(Boolean).join("; ");
      warnings.push(`${v.title}: ${parts}`);
    }
  }
  if (p.variants.length && missingRules) hidden.push("no_rules");
  if (!templateUsable(p.template)) hidden.push("no_template");

  const ro = readProductField(p, "open_store_related");
  const relatedOnly = ro.state === "set" && ro.value === true;
  const th = readProductField(p, "imagen_theme");
  const theme = th.state === "set" ? (th.value as string) : null;
  if (!theme && !relatedOnly) hidden.push("no_theme");
  if (theme && opts.themes) {
    const t = opts.themes.find((x) => x.slug === theme);
    if (!t || !t.active) hidden.push("theme_unavailable");
  }
  for (const f of productFieldProblems(p)) warnings.push(`${f.label}: ${f.problem} (the store default is used)`);
  return { product: p, relatedOnly, theme, sellable, hidden, warnings };
}

/** The grid: shown products that aren't related-only, in the collection's order. */
export function gridProducts(entries: StoreEntry[]): StoreEntry[] {
  return entries.filter((e) => !e.hidden.length && !e.relatedOnly);
}
