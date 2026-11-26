import { addDays } from "@/lib/biztime";
import { lowest } from "@/lib/shop/money";
import type { ShopProduct, ShopVariant } from "@/lib/shop/sources/types";
import type { StoreEntry } from "./catalog";

/** Pure helpers for the store and product pages (docs/open-store.md › Store page, Product page). */

export const SORTS = ["featured", "price-asc", "price-desc", "newest"] as const;
export type StoreSort = (typeof SORTS)[number];
export const isSort = (v: unknown): v is StoreSort => typeof v === "string" && (SORTS as readonly string[]).includes(v);

const available = (p: ShopProduct) => p.variants.filter((v) => v.availableForSale);

/** The cheapest available variant's price, the compare-at to strike through (when higher) and whether prices differ. */
export function priceSummary(p: ShopProduct): { from: string; was: string | null; many: boolean } {
  const vs = available(p).length ? available(p) : p.variants;
  const from = lowest(vs.map((v) => v.price)) ?? "0";
  const cheapest = vs.find((v) => Number(v.price) === Number(from));
  const was = cheapest?.compareAtPrice && Number(cheapest.compareAtPrice) > Number(from) ? cheapest.compareAtPrice : null;
  return { from, was, many: new Set(vs.map((v) => Number(v.price))).size > 1 };
}

/** "60% OFF": the store's discount when set, else the compare-at saving; null when there's none. */
export function badgePct(price: string, was: string | null, discountPct: number | null): number | null {
  if (discountPct && discountPct > 0) return Math.round(discountPct);
  if (was && Number(was) > Number(price)) return Math.round((1 - Number(price) / Number(was)) * 100);
  return null;
}

/** Sort for the grid: featured keeps the collection's order. */
export function sortEntries(entries: StoreEntry[], sort: StoreSort): StoreEntry[] {
  const list = [...entries];
  const price = (e: StoreEntry) => Number(priceSummary(e.product).from);
  if (sort === "price-asc") list.sort((a, b) => price(a) - price(b) || a.product.position - b.product.position);
  else if (sort === "price-desc") list.sort((a, b) => price(b) - price(a) || a.product.position - b.product.position);
  else if (sort === "newest") list.sort((a, b) => (b.product.store?.createdAt ?? "").localeCompare(a.product.store?.createdAt ?? "") || a.product.position - b.product.position);
  return list;
}

/** Filter chips: the product types in the list, in first-seen order. */
export function productTypes(entries: StoreEntry[]): string[] {
  return [...new Set(entries.map((e) => e.product.productType.trim()).filter(Boolean))];
}

/** "4-6" → [4, 6]; "3" → [3, 3]; anything else → null. */
export function parseDays(v: string | null | undefined): [number, number] | null {
  const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec((v ?? "").trim());
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

const isWeekend = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
};

/** `n` working days after `day` (YYYY-MM-DD), skipping Saturdays and Sundays. */
export function addWorkingDays(day: string, n: number): string {
  let d = day;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/**
 * Delivery estimate: today plus the size's making time plus the store's shipping time, in working days
 * (docs/open-store.md › Product page, 4). Null when either is missing.
 */
export function deliveryWindow(today: string, leadDays: string | null | undefined, shippingDays: string | null | undefined): { from: string; to: string } | null {
  const lead = parseDays(leadDays);
  const ship = parseDays(shippingDays);
  if (!lead || !ship) return null;
  return { from: addWorkingDays(today, lead[0] + ship[0]), to: addWorkingDays(today, lead[1] + ship[1]) };
}

/** "27 Nov" from YYYY-MM-DD. */
export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** One chip group per Shopify option (Size, Colour), with its values in the variants' order. */
type WithOptions = { options: { name: string; value: string }[] };

export function optionGroups(variants: WithOptions[]): { name: string; values: string[] }[] {
  const out: { name: string; values: string[] }[] = [];
  for (const v of variants) {
    for (const o of v.options) {
      let g = out.find((x) => x.name === o.name);
      if (!g) out.push((g = { name: o.name, values: [] }));
      if (!g.values.includes(o.value)) g.values.push(o.value);
    }
  }
  return out;
}

/** The variant with these option values (null when that combination doesn't exist). */
export function variantFor<V extends WithOptions>(variants: V[], chosen: Record<string, string>): V | null {
  return variants.find((v) => v.options.every((o) => chosen[o.name] === o.value)) ?? null;
}

/** The variant to show first: the one asked for (by Shopify's numeric id), else the first available, else the first. */
export function initialVariant(variants: ShopVariant[], legacyId: string | null | undefined): ShopVariant | null {
  return variants.find((v) => v.legacyId === legacyId) ?? variants.find((v) => v.availableForSale) ?? variants[0] ?? null;
}

/**
 * "On more gifts" (docs/open-store.md › On more gifts): the product's own list first, in order, then the other
 * open-store products in the collection's order, skipping the current one; the first `count` that `fits`.
 */
export function relatedEntries(current: ShopProduct, entries: StoreEntry[], count = 3, fits: (e: StoreEntry) => boolean = () => true): StoreEntry[] {
  const shown = entries.filter((e) => !e.hidden.length && e.product.id !== current.id);
  const byId = new Map(shown.map((e) => [e.product.id, e]));
  const own = (current.store?.related ?? []).map((id) => byId.get(id)).filter((e): e is StoreEntry => Boolean(e));
  const rest = shown.filter((e) => !own.includes(e));
  return [...own, ...rest].filter(fits).slice(0, count);
}

/** A chip's picture: Shopify's swatch (a colour and/or an image) or the variant's own photo. */
export type ChipPicture = { image: string | null; color: string | null };

/**
 * The pictures for one option's chips (open_store.picture_options): null when the option isn't shown with pictures,
 * or when any of its values has none (all or nothing, so the chips line up). Shopify's swatch comes first; else the
 * photo of the variant that value would pick, given the other choices, else of any variant with that value.
 */
export function chipPictures(
  option: string,
  values: string[],
  variants: { options: { name: string; value: string }[]; image?: string | null }[],
  chosen: Record<string, string>,
  swatches: Record<string, Record<string, { color: string | null; image: string | null }>>,
  pictureOptions: string[],
): Map<string, ChipPicture> | null {
  const sw = swatches[option] ?? {};
  const allSwatched = values.length > 0 && values.every((v) => sw[v]?.image || sw[v]?.color);
  const listed = pictureOptions.some((o) => o.trim().toLowerCase() === option.trim().toLowerCase());
  if (!allSwatched && !listed) return null;
  const has = (v: (typeof variants)[number], name: string, value: string) => v.options.some((o) => o.name === name && o.value === value);
  const out = new Map<string, ChipPicture>();
  for (const value of values) {
    const s = sw[value];
    if (s?.image || s?.color) {
      out.set(value, { image: s.image, color: s.color });
      continue;
    }
    const want = { ...chosen, [option]: value };
    const exact = variants.find((v) => Object.entries(want).every(([n, val]) => has(v, n, val)));
    const image = exact?.image ?? variants.find((v) => has(v, option, value) && v.image)?.image ?? null;
    if (!image) return null;
    out.set(value, { image, color: null });
  }
  return out;
}

/** A Shopify CDN picture at a small size for a chip; other hosts as they are. */
export function chipImageUrl(url: string, width = 120): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "cdn.shopify.com") return url;
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

/** Columns for a row of option chips: 4 when the values come in fours, else 3. */
export const chipColumns = (n: number) => (n === 4 || (n >= 7 && n % 4 === 0) ? 4 : 3);

/** An Imagen category compared without case, spaces, dashes or underscores ("Magic Store" = "magic-store" = "magicstore"). */
export const categoryKey = (c: string | null | undefined) => (c ?? "").toLowerCase().replace(/[\s_-]+/g, "");

/**
 * The themes the lists show (docs/open-store.md › Settings): those in `open_store.theme_category`, plus any a product
 * already uses, in Imagen's order. An empty category shows every theme. Never decides whether a product is in the store.
 */
export function listedThemes<T extends { slug: string; category: string | null }>(themes: T[], category: string, inUse: Iterable<string> = []): T[] {
  const want = categoryKey(category);
  if (!want) return themes;
  const used = new Set(inUse);
  return themes.filter((t) => categoryKey(t.category) === want || used.has(t.slug));
}

/** The words for each photo slot: the theme says how many; Shopify words them; a slot without words is "Photo n". */
export function photoSlots(
  count: number,
  words: { label: string; name_label?: string; name_placeholder?: string }[],
  /** Imagen's own label for each slot (ImagenTheme.inputs), used when Shopify's words have none. */
  imagenLabels: (string | null)[] = [],
): { label: string; nameLabel: string | null; namePlaceholder: string | null }[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => {
    const w = words[i];
    return { label: w?.label || imagenLabels[i] || `Photo ${i + 1}`, nameLabel: w?.name_label || null, namePlaceholder: w?.name_placeholder || null };
  });
}

/** `{name}` and `{product}` in a progress step. */
export function fillStep(text: string, name: string | null, product: string): string {
  return text.replaceAll("{name}", name?.trim() || "your pet").replaceAll("{product}", product);
}
