import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { upsertMember } from "@/lib/db/members";
import { generationById, generationsMadeBy, linkVisitorEmail, visitorCounts, markGenerationsOrdered, setVisitorCart, visitorById, visitorsForEmail, type StoreVisitorRow } from "@/lib/db/store";
import { getSettings } from "@/lib/settings";
import { fitVariant, target } from "@/lib/shop/fit";
import { getShopCartSource } from "@/lib/shop/sources";
import type { RemoteCart } from "@/lib/shop/sources/cart";
import { parseTemplate, templateFor } from "@/lib/shop/template";
import { borderWidthFor, checkLayerValues, layerActive, layerPosSchema, type LayerValues } from "@/lib/shop/layer";
import { getObject, putObject, signedUrl } from "@/lib/storage";
import { aliasPerson } from "@/lib/track";
import { storeTrack } from "./analytics";
import { firstTouchSource, type FirstTouch } from "./first-touch";
import { getStoreCatalog } from "./index";
import { storeCartAttributes, storeLineAttributes, sessionIdsFromOrder, visitorIdFromOrder } from "./order-lines";
import { ownsVisitor, type Asker } from "./owner";

/**
 * The open store's cart (docs/open-store.md › Cart and checkout): one Shopify cart per visitor, its id on the
 * visitor row. The lines live in Shopify only; each carries the picture and its rules as hidden attributes.
 */

export const addSchema = z.object({
  generationId: z.string().uuid(),
  variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/),
  quantity: z.number().int().min(1).max(100),
  from: z.enum(["product", "related"]).default("product"),
  /** The personalisation layer (text boxes t1, t2 and a picture id); checked against the product's template. */
  layer: z
    .object({
      t1: z.string().max(400).optional(),
      t2: z.string().max(400).optional(),
      art: z.string().max(40).nullable().optional(),
      /** Where the customer put each item (Reposition); used only when the template allows it. */
      pos: z.object({ t1: layerPosSchema.optional(), t2: layerPosSchema.optional(), art: layerPosSchema.optional() }).strict().optional(),
      /** "Add border" picked; its width comes from the template for the variant, never from here. */
      border: z.boolean().optional(),
    })
    .strict()
    .optional(),
});

export type CartFail = { ok: false; status: number; error: string; message?: string };
const fail = (status: number, error: string, message?: string): CartFail => ({ ok: false, status, error, ...(message ? { message } : {}) });


/** File id of a line's preview: `v_<visitor id>_<line id>` (the ownership check reads the visitor from it). */
export const previewFileId = (visitorId: string, lineId: string) => `v_${visitorId}_${lineId}`;
export function parsePreviewId(id: string): { visitorId: string; lineId: string } | null {
  const m = /^v_([0-9a-f-]{36})_([0-9a-f-]{36})$/.exec(id);
  return m ? { visitorId: m[1], lineId: m[2] } : null;
}
export const previewPath = (visitorId: string, lineId: string) => `${visitorId}/previews/${lineId}.jpg`;

/**
 * Whose cart this browser sees: its own visitor's, else (signed in on another device) the newest cart of a
 * visitor linked to the signed-in email.
 */
export async function cartOwner(a: Asker): Promise<StoreVisitorRow | null> {
  if (a.visitor?.shopify_cart_id) return a.visitor;
  if (a.user) {
    const linked = (await visitorsForEmail(a.user.email)).find((v) => v.shopify_cart_id);
    if (linked) return linked;
  }
  return a.visitor;
}

async function remoteCart(owner: StoreVisitorRow | null): Promise<RemoteCart | null> {
  if (!owner?.shopify_cart_id) return null;
  const src = await getShopCartSource();
  const cart = await src.get(owner.shopify_cart_id).catch(() => null);
  // Shopify expired it (or it was paid): the next Add to cart starts a new one.
  if (!cart) await setVisitorCart(owner.id, { id: null, checkoutUrl: null });
  return cart;
}

const attr = (attrs: { key: string; value: string }[], key: string) => attrs.find((x) => x.key === key)?.value ?? null;

/** Add to cart: re-checks the picture is theirs and ready, the size is sold and suits it; draws the line's preview. */
export async function addStoreLine(a: Asker, visitor: StoreVisitorRow, input: z.infer<typeof addSchema>): Promise<{ ok: true; lines: number } | CartFail> {
  const s = await getSettings(["shop.cart_max_lines", "shop.cart_line_max_qty", "shop.fulfilment_link_days", "shop.preview_width_px", "open_store.discount_code"] as const);
  if (input.quantity > s["shop.cart_line_max_qty"]) return fail(400, "quantity");
  const gen = await generationById(input.generationId);
  if (!gen || !(await ownsVisitor(a, gen.visitor_id))) return fail(404, "not_found");
  const img = gen.images[gen.chosen_index] ?? gen.images[0];
  if (gen.status !== "done" || !img?.storage_path || !gen.imagen_session_id) return fail(409, "picture_not_ready");
  const catalog = await getStoreCatalog();
  let found = null;
  for (const e of catalog.entries) {
    if (e.hidden.length) continue;
    const sv = e.sellable.find((x) => x.variant.id === input.variantId && x.variant.availableForSale);
    if (sv) found = { entry: e, sv };
  }
  if (!found) return fail(404, "not_in_store");
  const fit = fitVariant({ kind: "portrait", width: img.width, height: img.height }, found.sv.rules);
  if (!fit.ok) return fail(422, "doesnt_suit");

  // Whose cart: a signed-in person on another device adds to their own linked cart.
  const owner = (await cartOwner(a)) ?? visitor;
  const current = await remoteCart(owner);
  if (current && current.lines.length >= s["shop.cart_max_lines"]) return fail(409, "cart_full");

  // The personalisation layer: re-checked here against the live template (never trusted from the browser).
  const template = parseTemplate(found.entry.product.template?.value);
  let layerValues: LayerValues | null = null;
  if (layerActive(template?.layer)) {
    const c = checkLayerValues(template.layer, input.layer ?? {});
    if (!c.ok) return fail(422, "layer_invalid", c.error);
    layerValues = c.values;
    // The border's width is the template's for this variant (a size with no border drops it).
    if (layerValues.border) {
      const w = borderWidthFor(template.layer.border, found.sv.variant.options);
      if (w > 0) layerValues.borderWidth = w;
      else delete layerValues.border;
    }
  }

  const lineId = randomUUID();
  let previewUrl: string | null = null;
  if (template) {
    try {
      const bytes = await getObject("store-uploads", img.storage_path);
      const { renderPreview } = await import("@/lib/shop/render");
      const t = target(found.sv.rules);
      const jpeg = bytes ? await renderPreview({ template: templateFor(template, found.sv.variant.options), picture: bytes, crop: fit.crop, placement: found.sv.rules.placement, backgroundColour: found.sv.rules.background, targetAspect: t.w / t.h, width: s["shop.preview_width_px"], layerValues }) : null;
      if (jpeg) {
        const path = previewPath(owner.id, lineId);
        await putObject("store-uploads", path, jpeg, "image/jpeg");
        previewUrl = await signedUrl("store-uploads", path, s["shop.fulfilment_link_days"] * 86_400);
      }
    } catch (e) {
      console.error(`[open-store] preview failed: ${(e as Error).message}`);
    }
  }
  const line = {
    merchandiseId: input.variantId,
    quantity: input.quantity,
    attributes: storeLineAttributes({ lineId, picture: { imagenImageId: img.imagen_id, sessionId: gen.imagen_session_id, url: img.url, width: img.width, height: img.height, theme: gen.theme }, rules: found.sv.rules, crop: fit.crop, previewUrl, layer: layerValues ? { values: layerValues, version: template?.updated_at ?? null } : null }),
  };
  const src = await getShopCartSource();
  const code = s["open_store.discount_code"].trim();
  let cart: RemoteCart;
  try {
    cart = current
      ? await src.addLines(current.id, [line])
      : await src.create({ lines: [line], email: a.user?.email ?? owner.email ?? null, discountCodes: code ? [code] : [], attributes: storeCartAttributes(owner.id) });
  } catch (e) {
    console.error(`[open-store] Shopify cart failed: ${(e as Error).message}`);
    await storeTrack("error_store_cart", { stage: current ? "add" : "create", status_code: Number(/HTTP_(\d+)/.exec((e as { code?: string }).code ?? "")?.[1] ?? 0) || null }, { visitor: owner.id, email: null });
    return fail(502, "shopify_unavailable");
  }
  if (cart.id !== owner.shopify_cart_id) await setVisitorCart(owner.id, { id: cart.id, checkoutUrl: cart.checkoutUrl });
  await storeTrack(
    "store_added_to_cart",
    { product_id: found.entry.product.legacyId, variant_id: found.sv.variant.legacyId, theme_slug: gen.theme, personalised: Boolean(layerValues && (layerValues.t1 || layerValues.t2 || layerValues.art || layerValues.border)), price: found.sv.variant.price, quantity: input.quantity, from: input.from, lines_after: cart.lines.length, store_visitor_id: owner.id },
    { visitor: owner, email: a.user?.email ?? null },
  );
  return { ok: true, lines: cart.lines.length };
}

export type StoreCartLine = { id: string; title: string; variant: string; quantity: number; subtotal: string; total: string; preview: string | null; productId: string | null };
export type StoreCartView = { lines: StoreCartLine[]; subtotal: string; total: string; currency: string; count: number };

const EMPTY = (currency: string): StoreCartView => ({ lines: [], subtotal: "0.00", total: "0.00", currency, count: 0 });

export async function storeCartView(a: Asker): Promise<StoreCartView> {
  const currency = (await getSettings(["shop.currency"] as const))["shop.currency"];
  const owner = await cartOwner(a);
  const cart = await remoteCart(owner);
  if (!owner || !cart) return EMPTY(currency);
  const catalog = await getStoreCatalog();
  const variants = new Map(catalog.entries.flatMap((e) => e.product.variants.map((v) => [v.id, { product: e.product, variant: v }] as const)));
  const lines: StoreCartLine[] = cart.lines.map((l) => {
    const lineId = attr(l.attributes, "_vault_line_id");
    const v = variants.get(l.merchandiseId);
    return {
      id: lineId ?? l.id,
      title: v?.product.title ?? "",
      variant: v && v.product.variants.length > 1 ? v.variant.title : "",
      quantity: l.quantity,
      subtotal: l.subtotal.amount,
      total: l.total.amount,
      preview: lineId && /^[0-9a-f-]{36}$/.test(lineId) ? previewFileId(owner.id, lineId) : null,
      productId: v?.product.legacyId ?? null,
    };
  });
  return { lines, subtotal: cart.subtotal.amount, total: cart.total.amount, currency: cart.total.currency || currency, count: lines.reduce((n, l) => n + l.quantity, 0) };
}

async function findLine(a: Asker, lineId: string) {
  const owner = await cartOwner(a);
  const cart = await remoteCart(owner);
  const line = cart?.lines.find((l) => attr(l.attributes, "_vault_line_id") === lineId);
  return owner && cart && line ? { owner, cart, line } : null;
}

export async function changeStoreLine(a: Asker, lineId: string, quantity: number): Promise<{ ok: true } | CartFail> {
  const max = (await getSettings(["shop.cart_line_max_qty"] as const))["shop.cart_line_max_qty"];
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) return fail(400, "quantity");
  const f = await findLine(a, lineId);
  if (!f) return fail(404, "not_found");
  const cart = await (await getShopCartSource()).updateLines(f.cart.id, [{ id: f.line.id, quantity }]);
  await storeTrack("store_cart_changed", { change: "quantity", lines: cart.lines.length, store_visitor_id: f.owner.id }, { visitor: f.owner.id, email: a.user?.email ?? null });
  return { ok: true };
}

export async function removeStoreLine(a: Asker, lineId: string): Promise<{ ok: true } | CartFail> {
  const f = await findLine(a, lineId);
  if (!f) return fail(404, "not_found");
  const cart = await (await getShopCartSource()).removeLines(f.cart.id, [f.line.id]);
  await storeTrack("store_cart_changed", { change: "removed", lines: cart.lines.length, store_visitor_id: f.owner.id }, { visitor: f.owner.id, email: a.user?.email ?? null });
  return { ok: true };
}

/** Checkout: Shopify's own checkout link for the cart; for a signed-in customer Shopify already has their email. */
export async function storeCheckout(a: Asker): Promise<{ ok: true; url: string } | CartFail> {
  const owner = await cartOwner(a);
  const cart = await remoteCart(owner);
  if (!owner || !cart || !cart.lines.length) return fail(409, "empty");
  await storeTrack("store_checkout_started", { lines: cart.lines.length, subtotal: cart.subtotal.amount, signed_in: Boolean(a.user), store_visitor_id: owner.id }, { visitor: owner.id, email: a.user?.email ?? null });
  return { ok: true, url: cart.checkoutUrl };
}

const paidSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  test: z.boolean().optional().nullable(),
  currency: z.string().optional().nullable(),
  current_total_price: z.string().optional().nullable(),
  total_price: z.string().optional().nullable(),
  line_items: z.array(z.object({ properties: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable().transform((v) => (v === null ? null : String(v))) })).optional().nullable() })).default([]),
  note_attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable().transform((v) => (v === null ? null : String(v))) })).optional().nullable(),
});

/**
 * orders/paid with `_source` = `open_store` (docs/open-store.md › Cart and checkout, Visitors and sign-in): marks the
 * pictures ordered, links the visitor to the order's email if it has none, creates the member if needed, and
 * clears the visitor's cart so the next visit starts a new one. Idempotent: a repeat changes nothing.
 */
export async function recordStoreOrderPaid(payload: unknown): Promise<{ matched: boolean }> {
  const p = paidSchema.safeParse(payload);
  if (!p.success) return { matched: false };
  const visitorId = visitorIdFromOrder(p.data.note_attributes ?? []);
  if (!visitorId) return { matched: false };
  const visitor = await visitorById(visitorId);
  if (!visitor) return { matched: false };
  const marked = await markGenerationsOrdered(visitor.id, sessionIdsFromOrder(p.data.line_items), p.data.id);
  const email = p.data.email?.trim().toLowerCase() || null;
  let linked = false;
  if (email) {
    linked = await linkVisitorEmail(visitor.id, email, "order");
    await upsertMember(email, "store_order");
    // The whole journey on one person: the browser's anonymous PostHog id joins the order's email.
    if (visitor.posthog_distinct_id) await aliasPerson(email, visitor.posthog_distinct_id);
    if (linked) await storeTrack("store_visitor_linked", { via: "order", visitors_linked: 1 }, { visitor, email, source: "shopify", actor: "system" });
  }
  await setVisitorCart(visitor.id, { id: null, checkoutUrl: null });
  if (marked || linked) {
    const lines = p.data.line_items.filter((l) => l.properties?.some((x) => x.name === "_image_kind" && x.value === "generated")).length;
    await storeTrack(
      "store_order_paid",
      {
        order_id: p.data.id,
        order_name: p.data.name ?? null,
        lines,
        revenue: p.data.current_total_price ?? p.data.total_price ?? null,
        currency: p.data.currency ?? null,
        pictures_made: await generationsMadeBy(visitor.id),
        minutes_from_first_visit: Math.round((Date.now() - new Date(visitor.created_at).getTime()) / 60_000),
        first_touch_source: firstTouchSource(visitor.first_touch as FirstTouch | null),
        test: Boolean(p.data.test),
      },
      { visitor, email, source: "shopify", actor: "system", ref: { type: "order", id: p.data.id }, set: { store_orders: (await visitorCounts(visitor.id)).orders } },
    );
  }
  return { matched: true };
}
