import "server-only";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { dayIn } from "@/lib/biztime";
import { getSettings } from "@/lib/settings";
import { getProductSetting, getVariantSetting } from "@/lib/settings/product";
import type { ReassuranceRow } from "@/lib/settings/registry";
import { descriptionBlocks, type DescriptionBlock } from "@/lib/shop/description";
import { discountInfo } from "@/lib/shop";
import { discounted, percentOff } from "@/lib/shop/money";
import { promoFor, type PromoView } from "@/lib/shop/shell";
import { target } from "@/lib/shop/fit";
import type { VariantRules } from "@/lib/shop/rules";
import { parseTemplate, type Template } from "@/lib/shop/template";
import { canSeeOpenStore } from "./access";
import type { FaqItem, Guarantee, HowStep, StoreReview, TrustpilotSetting, TrustStat } from "./lower";
import { gridProducts, type StoreEntry } from "./catalog";
import { cachedRead, getStoreCatalog, imagenThemes } from "./index";
import type { OptionPictures } from "./sources/types";
import { getOpenStoreSource } from "./sources";
import type { StoreCollection } from "./sources/types";
import { badgePct, deliveryWindow, fillStep, photoSlots, priceSummary, productTypes, relatedEntries, shortDay, sortEntries, type StoreSort } from "./view";

/** Store routes: 404 unless the store is visible to this person (proxy.ts answers 404 first; this is the page's own check). */
export async function requireStoreVisible(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  const s = await getSettings(["open_store.enabled", "open_store.super_user_preview"] as const);
  if (!canSeeOpenStore({ enabled: s["open_store.enabled"], superUserPreview: s["open_store.super_user_preview"] }, user)) notFound();
  return user;
}

/** True when this is a super user's preview (the store is still off for everyone else). */
export async function isPreview(): Promise<boolean> {
  return !(await getSettings(["open_store.enabled"] as const))["open_store.enabled"];
}

export type Circle = { title: string; href: string; handle: string; image: string | null };

/** The store header and its category circles (the Shopify menu), the promotion bar for everyone. */
export async function storeShell(): Promise<{ circles: Circle[]; promo: PromoView | null }> {
  const s = await getSettings(["open_store.menu_handle", "open_store.home_collection"] as const);
  const [menu, promo] = await Promise.all([
    cachedRead(`menu:${s["open_store.menu_handle"]}`, async () => (await getOpenStoreSource()).menu(s["open_store.menu_handle"])).catch(() => null),
    promoFor("normal").catch(() => null),
  ]);
  const circles = (menu?.items ?? [])
    .filter((i) => i.collectionHandle)
    .map((i) => ({ title: i.title, handle: i.collectionHandle!, href: i.collectionHandle === s["open_store.home_collection"] ? "/store" : `/store/c/${i.collectionHandle}`, image: i.image?.url ?? null }));
  return { circles, promo };
}

export type Pricing = { currency: string; pct: number | null; label: string };

/** The store's discount (open_store.discount_code), as a percentage when Shopify says it is one. */
export async function storePricing(collectionGid: string | null): Promise<Pricing> {
  const s = await getSettings(["open_store.discount_code", "open_store.discount_label", "shop.currency"] as const);
  const info = s["open_store.discount_code"] ? await cachedRead(`discount:${s["open_store.discount_code"]}`, () => discountInfo(s["open_store.discount_code"])) : null;
  const pct = collectionGid ? percentOff(info, collectionGid) : null;
  return { currency: s["shop.currency"], pct, label: s["open_store.discount_label"] };
}

export type CardView = {
  id: string;
  legacyId: string;
  title: string;
  themeName: string | null;
  image: { url: string; alt: string } | null;
  price: string;
  was: string | null;
  many: boolean;
  badge: number | null;
  rating: number | null;
  ratingCount: number | null;
};

function card(e: StoreEntry, pricing: Pricing, themeNames: Map<string, string>): CardView {
  const p = e.product;
  const sum = priceSummary(p);
  const after = discounted(sum.from, pricing.pct);
  const price = after ?? sum.from;
  const was = sum.was ?? (after ? sum.from : null);
  return {
    id: p.id,
    legacyId: p.legacyId,
    title: p.title,
    themeName: e.theme ? (themeNames.get(e.theme) ?? null) : null,
    image: p.media[0] ? { url: p.media[0].url, alt: p.media[0].alt ?? p.title } : null,
    price,
    was,
    many: sum.many,
    badge: badgePct(price, was, pricing.pct != null ? pricing.pct * 100 : null),
    rating: p.store?.rating ?? null,
    ratingCount: p.store?.ratingCount ?? null,
  };
}

async function themeNameMap(): Promise<Map<string, string>> {
  return new Map((await imagenThemes())?.map((t) => [t.slug, t.name]) ?? []);
}

/** The store page for a collection (the home collection at /store), with filter, sort and "Show more" (docs/open-store.md › Store page). */
export async function storePageData(opts: { handle: string | null; type: string | null; sort: StoreSort; page: number }) {
  const s = await getSettings(["open_store.home_collection", "open_store.products_per_page"] as const);
  const handle = opts.handle ?? s["open_store.home_collection"];
  const magic = await getStoreCatalog();
  let collection: StoreCollection | null = magic.collection && magic.collection.handle === handle ? magic.collection : null;
  if (!collection) collection = await cachedRead(`collection:${handle}`, async () => (await getOpenStoreSource()).collection(handle)).catch(() => null);
  if (!collection) return null;
  const order = new Map(collection.productIds.map((id, i) => [id, i]));
  const inCollection = gridProducts(magic.entries)
    .filter((e) => order.has(e.product.id))
    .sort((a, b) => order.get(a.product.id)! - order.get(b.product.id)!)
    .map((e) => ({ ...e, product: { ...e.product, position: order.get(e.product.id)! } }));
  const types = productTypes(inCollection);
  const type = opts.type && types.includes(opts.type) ? opts.type : null;
  const filtered = sortEntries(type ? inCollection.filter((e) => e.product.productType.trim() === type) : inCollection, opts.sort);
  const shownCount = Math.min(filtered.length, s["open_store.products_per_page"] * Math.max(1, opts.page));
  const [pricing, themeNames] = await Promise.all([storePricing(magic.collection?.id ?? null), themeNameMap()]);
  return {
    collection: { handle: collection.handle, title: collection.title, description: collection.description },
    isHome: handle === s["open_store.home_collection"],
    types,
    type,
    total: filtered.length,
    cards: filtered.slice(0, shownCount).map((e) => card(e, pricing, themeNames)),
    more: filtered.length > shownCount,
    pricing,
  };
}

export type VariantView = {
  id: string;
  legacyId: string;
  title: string;
  options: { name: string; value: string }[];
  available: boolean;
  price: string;
  was: string | null;
  badge: string | null;
  /** "27 Nov – 30 Nov", or null when the making or shipping time isn't set. */
  delivery: string | null;
  /** Drawing their picture on the product: the print area's shape and how the picture sits (Open store 3). */
  aspect: number | null;
  /** The variant's own first photo in Shopify, for option chips with pictures. */
  image: string | null;
  placement: "cover" | "contain" | "wrap_zone";
  background: string | null;
};

/** How to draw a picture on a product: its template and its first sellable size's print shape and rules. */
export type DrawInfo = {
  template: Template;
  aspect: number;
  placement: "cover" | "contain" | "wrap_zone";
  background: string | null;
  /** For the fit check (docs/shop.md › Product rules), so only products that suit the picture are offered. */
  rules: { imageKinds: VariantRules["imageKinds"]; minShortSidePx: number; maxCropPct: number; placement: VariantRules["placement"]; printPx: VariantRules["printPx"]; zonePx: VariantRules["zonePx"] };
};

export type RelatedCard = CardView & { href: string; draw: DrawInfo | null };

function drawInfo(e: StoreEntry): DrawInfo | null {
  const template = parseTemplate(e.product.template?.value);
  const sv = e.sellable.find((x) => x.variant.availableForSale) ?? e.sellable[0];
  if (!template || !sv) return null;
  const t = target(sv.rules);
  const r = sv.rules;
  return { template, aspect: t.w / t.h, placement: r.placement, background: r.background ?? null, rules: { imageKinds: r.imageKinds, minShortSidePx: r.minShortSidePx, maxCropPct: r.maxCropPct, placement: r.placement, printPx: r.printPx, zonePx: r.zonePx } };
}

/** Everything the product page needs before a picture (docs/open-store.md › Product page). Null: not in the store. */
export async function productPageData(legacyId: string) {
  const s = await getSettings(["open_store.shipping_days", "open_store.reassurance", "open_store.home_collection", "brand.timezone", "open_store.picture_options"] as const);
  const magic = await getStoreCatalog();
  const entry = magic.entries.find((e) => e.product.legacyId === legacyId);
  if (!entry || entry.hidden.length) return null;
  const p = entry.product;
  const [pricing, themes, policies, photos, nameMax, photoTips, subject, stepLabels, imagesToShow, askName, pictures, lower, quality] = await Promise.all([
    storePricing(magic.collection?.id ?? null),
    imagenThemes(),
    cachedRead("policies", async () => (await getOpenStoreSource()).policies()).catch(() => ({ shippingHtml: null, refundHtml: null })),
    getProductSetting(p, "photos"),
    getProductSetting(p, "name_max"),
    getProductSetting(p, "photo_tips"),
    getProductSetting(p, "subject"),
    getProductSetting(p, "step_labels"),
    getProductSetting(p, "images_to_show"),
    getProductSetting(p, "ask_name"),
    // Swatches and variant photos for the option chips; none when Shopify can't be read (plain chips).
    cachedRead(`option-pictures:${p.id}`, async () => (await getOpenStoreSource()).optionPictures(p.id)).catch((): OptionPictures => ({ swatches: {}, variantImages: {} })),
    lowerPage(),
    getProductSetting(p, "quality"),
  ]);
  const themeNames = new Map(themes?.map((t) => [t.slug, t.name]) ?? []);
  const theme = entry.theme ? (themes?.find((t) => t.slug === entry.theme) ?? null) : null;
  const today = dayIn(s["brand.timezone"], new Date());
  const rules = new Map(entry.sellable.map((sv) => [sv.variant.id, sv.rules]));
  const variants: VariantView[] = await Promise.all(
    p.variants.map(async (v) => {
      const after = discounted(v.price, pricing.pct);
      const price = after ?? v.price;
      const was = v.compareAtPrice && Number(v.compareAtPrice) > Number(price) ? v.compareAtPrice : after ? v.price : null;
      const lead = await getVariantSetting(v, "lead_days");
      const win = deliveryWindow(today, lead, s["open_store.shipping_days"]);
      const r = rules.get(v.id);
      const t = r ? target(r) : null;
      return {
        id: v.id,
        legacyId: v.legacyId,
        title: v.title,
        options: v.options,
        available: v.availableForSale,
        price,
        was,
        badge: (await getVariantSetting(v, "badge")) || null,
        delivery: win ? `${shortDay(win.from)} – ${shortDay(win.to)}` : null,
        aspect: t ? t.w / t.h : null,
        image: pictures.variantImages[v.id] ?? null,
        placement: r?.placement ?? "cover",
        background: r?.background ?? null,
      };
    }),
  );
  // "Also made from one photo": related-only products are allowed here (and only here).
  // Every candidate (up to 24): the page shows them a step at a time (open_store.more_gifts_step), with a picture only the ones it suits.
  const related: RelatedCard[] = relatedEntries(p, magic.entries, 24).map((e) => ({ ...card(e, pricing, themeNames), href: `/store/product/${e.product.legacyId}`, draw: drawInfo(e) }));
  const details: DescriptionBlock[] = [...descriptionBlocks(p.descriptionHtml, p.description), ...(p.store?.details ? descriptionBlocks(null, p.store.details) : [])];
  const homeTitle = magic.collection?.handle === s["open_store.home_collection"] ? magic.collection.title : null;
  // The personalisation layer's pictures (from the art library), when the template offers any.
  const template = parseTemplate(p.template?.value) as Template | null;
  const { layerActive } = await import("@/lib/shop/layer");
  const layerArt = layerActive(template?.layer) && template.layer.art ? (await (await import("@/lib/shop/layer-art")).layerArtByIds(template.layer.art.choices).catch(() => [])).map((a) => ({ id: a.id, name: a.name, url: a.url, width: a.width, height: a.height })) : [];
  return {
    product: { id: p.id, legacyId: p.legacyId, title: p.title, handle: p.handle, seoTitle: p.store?.seoTitle ?? null, seoDescription: p.store?.seoDescription ?? null, rating: p.store?.rating ?? null, ratingCount: p.store?.ratingCount ?? null },
    theme: theme ? { slug: theme.slug, name: theme.name } : entry.theme ? { slug: entry.theme, name: entry.theme } : null,
    gallery: p.media.map((m) => ({ url: m.url, alt: m.alt ?? p.title })),
    template,
    layerArt,
    bullets: p.shortDescription ? descriptionBlocks(null, p.shortDescription) : [],
    details,
    shipping: [...descriptionBlocks(policies.shippingHtml), ...descriptionBlocks(policies.refundHtml)],
    reassurance: s["open_store.reassurance"] as ReassuranceRow[],
    variants,
    // Option chips with pictures (open_store.picture_options, or Shopify swatches on every value).
    optionSwatches: pictures.swatches,
    pictureOptions: s["open_store.picture_options"],
    // No name box when the product doesn't ask for the name (e.g. its personalisation layer does).
    slots: photoSlots(theme?.photos ?? photos.length, photos, theme?.inputs?.map((i) => i.label) ?? []).map((sl) => (askName ? sl : { ...sl, nameLabel: null, namePlaceholder: null })),
    nameMax,
    photoTips,
    subject,
    steps: stepLabels.map((l) => fillStep(l, null, p.title)),
    stepTemplates: stepLabels,
    imagesToShow,
    related,
    relatedOnly: entry.relatedOnly,
    pricing,
    breadcrumb: homeTitle ? { title: homeTitle, href: "/store" } : null,
    // The trust card and the lower page (docs/open-store.md › Product page, items 9 and 12 to 18).
    lower: { ...lower, quality },
  };
}

export type LowerPage = {
  trustStats: TrustStat[];
  /** Null: no Trustpilot line anywhere (no score in settings). */
  trustpilot: (TrustpilotSetting & { score: number }) | null;
  howSteps: HowStep[];
  wallPhotos: string[];
  reviews: StoreReview[];
  guarantees: Guarantee[];
  faq: FaqItem[];
};

/** The store-wide words, numbers and photos of the product page's trust card and lower sections. */
async function lowerPage(): Promise<LowerPage> {
  const s = await getSettings(["open_store.trust_stats", "open_store.trustpilot", "open_store.how_steps", "open_store.wall_photos", "open_store.reviews", "open_store.guarantees", "open_store.faq"] as const);
  const tp = s["open_store.trustpilot"] as TrustpilotSetting;
  return {
    trustStats: s["open_store.trust_stats"] as TrustStat[],
    trustpilot: tp.score != null ? { ...tp, score: tp.score } : null,
    howSteps: s["open_store.how_steps"] as HowStep[],
    wallPhotos: s["open_store.wall_photos"],
    reviews: s["open_store.reviews"] as StoreReview[],
    guarantees: s["open_store.guarantees"] as Guarantee[],
    faq: s["open_store.faq"] as FaqItem[],
  };
}

export type ProductPageData = NonNullable<Awaited<ReturnType<typeof productPageData>>>;
