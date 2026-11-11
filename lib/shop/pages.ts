import "server-only";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/types";
import { getSettings } from "@/lib/settings";
import { canSeeShop } from "./access";
import { forPage, type CatalogEntry } from "./catalog";
import { descriptionBlocks, type DescriptionBlock } from "./description";
import { ideasFor, target, type Idea } from "./fit";
import { getCatalog, pricingFor, type CustomerType } from "./index";
import { discounted, lowest } from "./money";
import { ensureSize, listPictures, pictureFor, pictureLink } from "./pictures";
import { getShopCatalogSource } from "./sources";
import { parseTemplate, type Template } from "./template";

export type ShopPage = "gifts" | "products";

/** Shop routes: the signed-in person when they can see the shop; sign-in when it's on for everyone; else 404. */
export async function requireShopUser(path: string): Promise<SessionUser> {
  const user = await getSessionUser();
  const s = await getSettings(["shop.enabled", "shop.super_user_preview"] as const);
  const flags = { enabled: s["shop.enabled"], superUserPreview: s["shop.super_user_preview"] };
  if (user && canSeeShop(flags, user)) return user;
  if (!user && flags.enabled) redirect(`/signin?next=${encodeURIComponent(path)}`);
  notFound();
}

export type Pricing = { label: string; pct: number | null; currency: string; customerType: CustomerType };
export type CardView = { handle: string; title: string; productType: string; occasions: string[]; image: string | null; from: string; fromDiscounted: string | null; many: boolean };

function card(e: CatalogEntry, pct: number | null): CardView {
  const from = lowest(e.sellable.map((s) => s.variant.price)) ?? "0";
  return { handle: e.product.handle, title: e.product.title, productType: e.product.productType, occasions: e.product.occasions, image: e.product.media[0]?.url ?? null, from, fromDiscounted: discounted(from, pct), many: e.sellable.length > 1 };
}

async function occasionOrder(entries: CatalogEntry[]): Promise<string[]> {
  const ns = (await getSettings(["shop.metafield_namespace"] as const))["shop.metafield_namespace"];
  try {
    const defs = await (await getShopCatalogSource()).fieldDefinitions(ns);
    const choices = defs.find((d) => d.ownerType === "PRODUCT" && d.key === "occasions")?.choices;
    if (choices?.length) return choices;
  } catch {
    /* fall back to the occasions products use */
  }
  return [...new Set(entries.flatMap((e) => e.product.occasions))];
}

/** The Gifts page (by occasion) or the Products page (by product type). */
export async function landingData(user: SessionUser, page: ShopPage, filter: string | null) {
  // Pricing, the catalog and the setting side by side; the person's pictures stream in separately (recentPictures).
  const [pricing, catalog, s] = await Promise.all([pricingFor(user.email), getCatalog(), getSettings(["shop.top_picks_count"] as const)]);
  const entries = forPage(catalog, page);
  const groups = page === "gifts" ? (await occasionOrder(entries)).filter((o) => entries.some((e) => e.product.occasions.includes(o))) : [...new Set(entries.map((e) => e.product.productType.trim()).filter(Boolean))];
  const inGroup = (e: CatalogEntry, g: string) => (page === "gifts" ? e.product.occasions.includes(g) : e.product.productType.trim() === g);
  const chosen = filter && groups.includes(filter) ? filter : null;
  const sections = (chosen ? [chosen] : groups).map((g) => ({ title: g, products: entries.filter((e) => inGroup(e, g)).map((e) => card(e, pricing.pct)) })).filter((s) => s.products.length);
  const ungrouped = entries.filter((e) => !groups.some((g) => inGroup(e, g)));
  if (!chosen && ungrouped.length) sections.push({ title: "", products: ungrouped.map((e) => card(e, pricing.pct)) });
  return { pricing: pricing as Pricing, groups, chosen, sections, total: entries.length, topPicks: s["shop.top_picks_count"] };
}

export type RecentPicture = { id: string; url: string | null };

/** The person's three newest pictures for the "Start with a picture" box. Never throws: none on failure. */
export async function recentPictures(email: string): Promise<RecentPicture[]> {
  try {
    const pictures = await listPictures(email);
    return await Promise.all([...pictures.portraits, ...pictures.photos].slice(0, 3).map(async (p) => ({ id: p.id, url: await pictureLink(p) })));
  } catch {
    return [];
  }
}

export type PictureView = { id: string; kind: string; url: string | null; ordered: boolean; small: boolean };

/** Choose a picture: their portraits and photos, with the ones too small for most prints marked. */
export async function choosePictureData(user: SessionUser) {
  const s = await getSettings(["shop.default_min_short_side_px"] as const);
  const list = await listPictures(user.email);
  const view = async (p: Awaited<ReturnType<typeof listPictures>>["portraits"][number]): Promise<PictureView> => ({
    id: p.id,
    kind: p.kind,
    url: await pictureLink(p),
    ordered: p.ordered,
    small: Boolean(p.width && p.height && Math.min(p.width, p.height) < s["shop.default_min_short_side_px"]),
  });
  return { portraits: await Promise.all(list.portraits.map(view)), photos: await Promise.all(list.photos.map(view)), partial: list.partial };
}

export type VariantView = {
  id: string;
  title: string;
  options: { name: string; value: string }[];
  price: string;
  discounted: string | null;
  crop: { x: number; y: number; w: number; h: number };
  placement: "cover" | "contain" | "wrap_zone";
  aspect: number;
  background: string | null;
  adjustable: boolean;
  minShortSidePx: number;
  maxCropPct: number;
};
export type IdeaView = { handle: string; title: string; description: DescriptionBlock[]; position: number; occasions: string[]; template: Template; from: string; fromDiscounted: string | null; variants: VariantView[] };

function ideaView(i: Idea, pct: number | null): IdeaView | null {
  const template = parseTemplate(i.entry.product.template?.value);
  if (!template) return null;
  return {
    handle: i.entry.product.handle,
    title: i.entry.product.title,
    // The shop's own short text when it has one, else the product's full Shopify description.
    description: i.entry.product.shortDescription ? descriptionBlocks(null, i.entry.product.shortDescription) : descriptionBlocks(i.entry.product.descriptionHtml, i.entry.product.description),
    position: i.entry.product.position,
    occasions: i.entry.product.occasions,
    template,
    from: i.fromPrice,
    fromDiscounted: discounted(i.fromPrice, pct),
    variants: i.variants.map((v) => {
      const t = target(v.rules);
      return {
        id: v.variant.id,
        title: v.variant.title,
        options: v.variant.options,
        price: v.variant.price,
        discounted: discounted(v.variant.price, pct),
        crop: v.fit.crop,
        placement: v.rules.placement,
        aspect: t.w / t.h,
        background: v.rules.background,
        adjustable: v.rules.adjustable,
        minShortSidePx: v.rules.minShortSidePx,
        maxCropPct: v.rules.maxCropPct,
      };
    }),
  };
}

/** Product ideas for one of their pictures; null when the picture isn't theirs. */
export async function ideasData(user: SessionUser, page: ShopPage, imageId: string) {
  // The picture, the pricing and the catalog side by side (pictureFor and listPictures share one read per request).
  const [pic, s, pricing, catalog] = await Promise.all([
    pictureFor(user.email, imageId),
    getSettings(["shop.top_picks_count", "shop.change_strip_count", "shop.cart_line_max_qty"] as const),
    pricingFor(user.email),
    getCatalog(),
  ]);
  if (!pic) return null;
  const img = await ensureSize(user.email, pic);
  const entries = forPage(catalog, page);
  const ideas = img.width && img.height ? ideasFor(entries, { kind: img.kind, width: img.width, height: img.height }).map((i) => ideaView(i, pricing.pct)).filter((v): v is IdeaView => v !== null) : [];
  // When nothing fits, say whether the picture is too small for every size (rather than the wrong shape).
  const needs = entries.flatMap((e) => e.sellable.map((v) => v.rules.minShortSidePx));
  const shortSide = img.width && img.height ? Math.min(img.width, img.height) : 0;
  const need = needs.length ? Math.min(...needs) : 0;
  const tooSmall = !ideas.length && shortSide > 0 && need > shortSide ? { px: shortSide, need } : null;
  const n = s["shop.top_picks_count"];
  const top = ideas.slice(0, n);
  const rest = ideas.slice(n);
  const list = await listPictures(user.email).catch(() => ({ portraits: [], photos: [], partial: true }));
  const others = await Promise.all(
    [...list.portraits, ...list.photos]
      .filter((p) => p.id !== pic.id)
      .slice(0, s["shop.change_strip_count"])
      .map(async (p) => ({ id: p.id, url: await pictureLink(p) })),
  );
  return {
    picture: { id: img.id, kind: img.kind, url: await pictureLink(img), width: img.width, height: img.height, ordered: img.ordered },
    sizeKnown: Boolean(img.width && img.height),
    tooSmall,
    top,
    rest,
    others,
    pricing: pricing as Pricing,
    maxQty: s["shop.cart_line_max_qty"],
  };
}
