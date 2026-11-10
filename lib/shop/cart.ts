import "server-only";
import { z } from "zod";
import { cartLines, deleteLine, ensureOpenCart, imageRowById, insertLine, markCartPaid, openCartFor, ownLine, rememberExternalImage, updateCart, updateLine, type ShopCartRow, type ShopImageRow, type ShopLineRow } from "@/lib/db/shop";
import { getSettings } from "@/lib/settings";
import { putObject, signedUrl } from "@/lib/storage";
import { track } from "@/lib/track";
import { maskEmail } from "@/lib/utils";
import type { CatalogEntry, SellableVariant } from "./catalog";
import { cropAllowed, fitVariant, target, type Rect } from "./fit";
import { discounted } from "./money";
import { customerTypeFor, discountSettingFor, getCatalog, pricingFor, type CustomerType } from "./index";
import { cartAttributes, cartIdFromOrder, lineAttributes, sameAttrs } from "./order-lines";
import { ensureSize, pictureBytes, pictureFor } from "./pictures";
import { renderPreview } from "./render";
import { getShopCartSource } from "./sources";
import type { Attr, RemoteCart } from "./sources/cart";
import { parseTemplate } from "./template";

/** The cart (docs/shop.md › Cart and checkout). Ours holds pictures and crops; Shopify's holds the prices. */

export const addLineSchema = z.object({
  page: z.enum(["gifts", "products"]),
  imageId: z.string().min(3).max(80),
  variantId: z.string().regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/),
  quantity: z.number().int().min(1).max(100),
  crop: z.object({ x: z.number().int(), y: z.number().int(), w: z.number().int(), h: z.number().int() }).optional(),
});

export type CartError = { ok: false; status: number; error: string };
const fail = (status: number, error: string): CartError => ({ ok: false, status, error });

function findVariant(entries: CatalogEntry[], variantId: string, page: "gifts" | "products"): { entry: CatalogEntry; sv: SellableVariant } | null {
  for (const e of entries) {
    if (e.hidden.length || (e.page !== page && e.page !== "all")) continue;
    const sv = e.sellable.find((s) => s.variant.id === variantId);
    if (sv) return { entry: e, sv };
  }
  return null;
}

async function currentDiscount(email: string): Promise<{ customerType: CustomerType; code: string | null }> {
  const customerType = await customerTypeFor(email);
  return { customerType, code: (await discountSettingFor(customerType)).code };
}

/** Add to cart: re-checks the picture is theirs, the size suits it and the crop is allowed, then draws the preview. */
export async function addToCart(email: string, input: z.infer<typeof addLineSchema>): Promise<{ ok: true; lineId: string; count: number } | CartError> {
  const s = await getSettings(["shop.cart_max_lines", "shop.cart_line_max_qty", "shop.preview_width_px"] as const);
  if (input.quantity > s["shop.cart_line_max_qty"]) return fail(400, "too_many");
  const pic = await pictureFor(email, input.imageId);
  if (!pic) return fail(404, "picture_not_found");
  const img = await ensureSize(email, pic);
  if (!img.width || !img.height) return fail(422, "picture_size_unknown");
  const found = findVariant(await getCatalog(), input.variantId, input.page);
  if (!found) return fail(404, "product_not_available");
  const { entry, sv } = found;
  const fit = fitVariant(img, sv.rules);
  if (!fit.ok) return fail(422, `doesnt_suit:${fit.reason}`);
  const crop: Rect = input.crop ?? fit.crop;
  if (input.crop && !cropAllowed(input.crop, { width: img.width, height: img.height }, sv.rules)) return fail(400, "crop_not_allowed");

  const { customerType, code } = await currentDiscount(email);
  const cart = await ensureOpenCart(email, { customerType, discountCode: code });
  const lines = await cartLines(cart.id);

  // The picture's own row (sizes, owner), which the line points at.
  const imageRowId = pic.kind === "new_upload" ? pic.id.slice(2) : await rememberExternalImage(email, { kind: pic.kind, url: (pic.source as { url: string }).url, ref: pic.ref, session: pic.sessionId, width: img.width, height: img.height });
  const same = lines.find((l) => l.variant_id === sv.variant.id && l.image_id === imageRowId && l.page === input.page && JSON.stringify(l.crop) === JSON.stringify(crop));
  if (same) {
    const qty = Math.min(s["shop.cart_line_max_qty"], same.quantity + input.quantity);
    await updateLine(same.id, { quantity: qty });
    await updateCart(cart.id, {});
    await track("shop_cart_changed", { change: "quantity", lines: lines.length }, { email });
    return { ok: true, lineId: same.id, count: lines.reduce((n, l) => n + (l.id === same.id ? qty : l.quantity), 0) };
  }
  if (lines.length >= s["shop.cart_max_lines"]) return fail(409, "cart_full");

  const template = parseTemplate(entry.product.template?.value);
  const line = await insertLine({
    id: crypto.randomUUID(),
    cart_id: cart.id,
    page: input.page,
    product_id: entry.product.id,
    variant_id: sv.variant.id,
    quantity: input.quantity,
    image_id: imageRowId,
    crop,
    rules_version: sv.rules.version,
    template_version: template?.updated_at ?? entry.product.template?.updatedAt ?? null,
    preview_path: null,
  });
  // The preview the customer saw, for the order line and customer service. Never blocks adding.
  try {
    const bytes = template ? await pictureBytes(img) : null;
    const t = target(sv.rules);
    const jpeg = bytes && template ? await renderPreview({ template, picture: bytes, crop, placement: sv.rules.placement, backgroundColour: sv.rules.background, targetAspect: t.w / t.h, width: s["shop.preview_width_px"] }) : null;
    if (jpeg) {
      const path = `p/${line.id}.jpg`;
      await putObject("shop-uploads", path, jpeg, "image/jpeg");
      await updateLine(line.id, { preview_path: path });
    }
  } catch (e) {
    console.error(`[shop] preview failed (${maskEmail(email)}): ${(e as Error).message}`);
  }
  await updateCart(cart.id, {});
  await track(
    "shop_added_to_cart",
    { product_handle: entry.product.handle, variant_id: sv.variant.legacyId, price: sv.variant.price, page: input.page, image_kind: pic.kind, customer_type: customerType, position: entry.product.position },
    { email },
  );
  return { ok: true, lineId: line.id, count: lines.reduce((n, l) => n + l.quantity, 0) + input.quantity };
}

export async function changeQuantity(email: string, lineId: string, quantity: number): Promise<{ ok: true } | CartError> {
  const own = await ownLine(email, lineId);
  if (!own) return fail(404, "not_found");
  const max = (await getSettings(["shop.cart_line_max_qty"] as const))["shop.cart_line_max_qty"];
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) return fail(400, "bad_quantity");
  await updateLine(lineId, { quantity });
  await updateCart(own.cart.id, {});
  await track("shop_cart_changed", { change: "quantity" }, { email });
  return { ok: true };
}

export async function removeLine(email: string, lineId: string): Promise<{ ok: true } | CartError> {
  const own = await ownLine(email, lineId);
  if (!own) return fail(404, "not_found");
  await deleteLine(lineId);
  if (own.line.preview_path) {
    const { removeObjects } = await import("@/lib/storage");
    await removeObjects("shop-uploads", [own.line.preview_path]);
  }
  await updateCart(own.cart.id, {});
  await track("shop_cart_changed", { change: "removed" }, { email });
  return { ok: true };
}

export type LineProblem = "unavailable" | "doesnt_suit" | "picture_gone";
export type CartLineView = {
  id: string;
  page: "gifts" | "products";
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  previewUrl: string | null;
  unitPrice: string;
  /** Price × quantity before any discount. */
  listTotal: string;
  /** The customer's discount worked out by us (the same as on the product pages), or null with no discount. */
  ourTotal: string | null;
  /** Shopify's figures when the cart is in step with Shopify; null otherwise. */
  shopify: { subtotal: string; total: string } | null;
  problem: LineProblem | null;
};
export type CartView = {
  cartId: string | null;
  lines: CartLineView[];
  count: number;
  hasGift: boolean;
  giftFor: string;
  giftMessage: string;
  currency: string;
  /** Shopify's own figures, or null when Shopify can't be reached (prices then show without the discount). */
  figures: { subtotal: string; total: string; discount: string; codeApplied: boolean } | null;
  customerType: CustomerType;
  /** The customer's discount (0–1) on Store products, or null. */
  pct: number | null;
};

type Checked = { line: ShopLineRow; entry: CatalogEntry | null; sv: SellableVariant | null; image: ShopImageRow | null; problem: LineProblem | null };

async function checkLines(email: string, lines: ShopLineRow[]): Promise<Checked[]> {
  const entries = await getCatalog();
  const out: Checked[] = [];
  for (const line of lines) {
    const image = await imageRowById(email, line.image_id);
    const found = findVariant(entries, line.variant_id, line.page);
    const entry = found?.entry ?? entries.find((e) => e.product.id === line.product_id) ?? null;
    let problem: LineProblem | null = null;
    if (!image) problem = "picture_gone";
    else if (!found || !found.sv.variant.availableForSale) problem = "unavailable";
    else if (!fitVariant({ kind: image.kind, width: image.width, height: image.height }, found.sv.rules).ok) problem = "doesnt_suit";
    out.push({ line, entry, sv: found?.sv ?? null, image, problem });
  }
  return out;
}

async function imageUrlFor(image: ShopImageRow, days: number): Promise<string | null> {
  if (image.source_url) return image.source_url;
  return image.storage_path ? signedUrl("shop-uploads", image.storage_path, days * 86_400) : null;
}

/** Brings Shopify's cart in step with ours: creates it, or adds, changes and removes lines by `_vault_line_id`. */
async function syncShopify(email: string, cart: ShopCartRow, checked: Checked[], gift: { for: string; message: string } | null): Promise<RemoteCart> {
  const days = (await getSettings(["shop.fulfilment_link_days"] as const))["shop.fulfilment_link_days"];
  const src = await getShopCartSource();
  const usable = checked.filter((c) => !c.problem && c.sv && c.image);
  const wanted = async (c: Checked) => {
    const image = c.image!;
    const url = await imageUrlFor(image, days);
    const previewUrl = c.line.preview_path ? await signedUrl("shop-uploads", c.line.preview_path, days * 86_400) : null;
    return {
      merchandiseId: c.line.variant_id,
      quantity: c.line.quantity,
      attributes: lineAttributes({
        lineId: c.line.id,
        page: c.line.page,
        image: { kind: image.kind, url: url ?? "", width: image.width ?? 0, height: image.height ?? 0, imageId: image.kind === "portrait" ? image.source_ref : null, sessionId: image.kind === "portrait" ? image.source_session : null },
        rules: c.sv!.rules,
        crop: c.line.crop ?? { x: 0, y: 0, w: image.width ?? 0, h: image.height ?? 0 },
        previewUrl,
      }),
    };
  };
  const attrs = cartAttributes({ cartId: cart.id, gift });
  const codes = cart.discount_code ? [cart.discount_code] : [];
  let remote = cart.shopify_cart_id ? await src.get(cart.shopify_cart_id).catch(() => null) : null;
  if (!remote) {
    if (!usable.length) throw new Error("empty");
    remote = await src.create({ lines: await Promise.all(usable.map(wanted)), email, discountCodes: codes, attributes: attrs });
    await updateCart(cart.id, { shopify_cart_id: remote.id, shopify_checkout_url: remote.checkoutUrl });
    return remote;
  }
  const vaultId = (a: Attr[]) => a.find((x) => x.key === "_vault_line_id")?.value;
  const wantIds = new Set(usable.map((c) => c.line.id));
  const stale = remote.lines.filter((l) => !wantIds.has(vaultId(l.attributes) ?? ""));
  if (stale.length) remote = await src.removeLines(remote.id, stale.map((l) => l.id));
  const byVault = new Map(remote.lines.map((l) => [vaultId(l.attributes), l]));
  const changed = usable.filter((c) => byVault.has(c.line.id) && byVault.get(c.line.id)!.quantity !== c.line.quantity);
  if (changed.length) remote = await src.updateLines(remote.id, changed.map((c) => ({ id: byVault.get(c.line.id)!.id, quantity: c.line.quantity })));
  const missing = usable.filter((c) => !byVault.has(c.line.id));
  if (missing.length) remote = await src.addLines(remote.id, await Promise.all(missing.map(wanted)));
  if (JSON.stringify(remote.discountCodes.map((d) => d.code).sort()) !== JSON.stringify([...codes].sort())) remote = await src.setDiscountCodes(remote.id, codes);
  if (!sameAttrs(remote.attributes, attrs)) remote = await src.setAttributes(remote.id, attrs);
  return remote;
}

/** The cart page: our lines with their previews, checked again, and Shopify's figures. */
export async function cartView(email: string): Promise<CartView> {
  const s = await getSettings(["shop.currency", "shop.image_link_seconds"] as const);
  const cart = await openCartFor(email);
  const customerType = await customerTypeFor(email);
  const pct = (await pricingFor(email).catch(() => null))?.pct ?? null;
  const empty: CartView = { cartId: null, lines: [], count: 0, hasGift: false, giftFor: "", giftMessage: "", currency: s["shop.currency"], figures: null, customerType, pct };
  if (!cart) return empty;
  const lines = await cartLines(cart.id);
  if (!lines.length) return { ...empty, cartId: cart.id, giftFor: cart.gift_for ?? "", giftMessage: cart.gift_message ?? "" };
  // The customer's type can change (a VIP tag added): keep the cart's code in step.
  const { code } = await discountSettingFor(customerType);
  if (code !== cart.discount_code || customerType !== cart.customer_type) {
    await updateCart(cart.id, { discount_code: code, customer_type: customerType });
    cart.discount_code = code;
    cart.customer_type = customerType;
  }
  const checked = await checkLines(email, lines);
  let remote: RemoteCart | null = null;
  try {
    remote = checked.some((c) => !c.problem) ? await syncShopify(email, cart, checked, null) : null;
  } catch (e) {
    console.error(`[shop] Shopify cart unavailable (${maskEmail(email)}): ${(e as Error).message}`);
  }
  const byVault = new Map((remote?.lines ?? []).map((l) => [l.attributes.find((a) => a.key === "_vault_line_id")?.value, l]));
  const views: CartLineView[] = [];
  for (const c of checked) {
    const r = byVault.get(c.line.id);
    const listTotal = ((Math.round(Number(c.sv?.variant.price ?? "0") * 100) * c.line.quantity) / 100).toFixed(2);
    views.push({
      id: c.line.id,
      page: c.line.page,
      productTitle: c.entry?.product.title ?? "This product",
      variantTitle: c.sv && c.sv.variant.title !== "Default Title" ? c.sv.variant.title : null,
      quantity: c.line.quantity,
      previewUrl: c.line.preview_path ? await signedUrl("shop-uploads", c.line.preview_path, s["shop.image_link_seconds"]) : null,
      unitPrice: c.sv?.variant.price ?? "0",
      listTotal,
      ourTotal: c.sv ? discounted(listTotal, pct) : null,
      shopify: r ? { subtotal: r.subtotal.amount, total: r.total.amount } : null,
      problem: c.problem,
    });
  }
  const figures = remote
    ? { subtotal: remote.subtotal.amount, total: remote.total.amount, discount: (Number(remote.subtotal.amount) - Number(remote.total.amount)).toFixed(2), codeApplied: remote.discountCodes.some((d) => d.applicable) }
    : null;
  return {
    cartId: cart.id,
    lines: views,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    hasGift: lines.some((l) => l.page === "gifts"),
    giftFor: cart.gift_for ?? "",
    giftMessage: cart.gift_message ?? "",
    currency: remote?.subtotal.currency ?? s["shop.currency"],
    figures,
    customerType,
    pct,
  };
}

/** The header's cart count (0 when there's no cart). Cheap: our own rows only. */
export async function cartCount(email: string): Promise<number> {
  try {
    const cart = await openCartFor(email);
    if (!cart) return 0;
    return (await cartLines(cart.id)).reduce((n, l) => n + l.quantity, 0);
  } catch {
    return 0;
  }
}

export const checkoutSchema = z.object({ giftFor: z.string().trim().max(120).optional(), giftMessage: z.string().max(2000).optional() });

/** Checkout: every line checked again on the server, the gift details saved on Shopify's cart, then Shopify's checkout link. */
export async function startCheckout(email: string, input: z.infer<typeof checkoutSchema>): Promise<{ ok: true; checkoutUrl: string } | (CartError & { lines?: string[] })> {
  const max = (await getSettings(["shop.gift_message_max_chars"] as const))["shop.gift_message_max_chars"];
  const cart = await openCartFor(email);
  if (!cart) return fail(409, "empty");
  const lines = await cartLines(cart.id);
  if (!lines.length) return fail(409, "empty");
  const checked = await checkLines(email, lines);
  const bad = checked.filter((c) => c.problem);
  if (bad.length) return { ...fail(409, "lines_need_attention"), lines: bad.map((c) => c.line.id) };
  const hasGift = lines.some((l) => l.page === "gifts");
  let gift: { for: string; message: string } | null = null;
  if (hasGift) {
    const name = (input.giftFor ?? "").trim();
    const message = (input.giftMessage ?? "").trim();
    if (!name) return fail(400, "gift_name_required");
    if (message.length > max) return fail(400, "gift_message_too_long");
    gift = { for: name, message };
  }
  // The customer type is read again now, so the code on the cart matches who is paying.
  const customerType = await customerTypeFor(email, { fresh: true });
  const { code } = await discountSettingFor(customerType);
  await updateCart(cart.id, { customer_type: customerType, discount_code: code, gift_for: gift?.for ?? null, gift_message: gift?.message || null });
  cart.customer_type = customerType;
  cart.discount_code = code;
  let remote: RemoteCart;
  try {
    remote = await syncShopify(email, cart, checked, gift);
  } catch (e) {
    console.error(`[shop] checkout: Shopify cart failed (${maskEmail(email)}): ${(e as Error).message}`);
    return fail(502, "shopify_unavailable");
  }
  await updateCart(cart.id, { checked_out_at: new Date().toISOString(), shopify_checkout_url: remote.checkoutUrl, shopify_cart_id: remote.id });
  await track("shop_checkout_started", { lines: lines.length, subtotal: remote.subtotal.amount, has_gift: hasGift, customer_type: customerType }, { email });
  return { ok: true, checkoutUrl: remote.checkoutUrl };
}

const paidSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  email: z.string().optional().nullable(),
  test: z.boolean().optional().nullable(),
  current_total_price: z.string().optional().nullable(),
  total_price: z.string().optional().nullable(),
  line_items: z.array(z.object({ properties: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable() })).optional().nullable() })).default([]),
  note_attributes: z.array(z.object({ name: z.string(), value: z.union([z.string(), z.number()]).nullable().transform((v) => (v === null ? null : String(v))) })).optional().nullable(),
});

/** orders/paid: an order with our `_vault_cart_id` marks that cart paid, so the next visit starts a new one. */
export async function recordShopOrderPaid(payload: unknown): Promise<{ matched: boolean }> {
  const p = paidSchema.safeParse(payload);
  if (!p.success) return { matched: false };
  const cartId = cartIdFromOrder(p.data.note_attributes ?? []);
  if (!cartId) return { matched: false };
  const changed = await markCartPaid(cartId, p.data.id);
  if (changed) {
    const shopLines = p.data.line_items.filter((l) => l.properties?.some((x) => x.name === "_shop" && String(x.value) === "true")).length;
    await track("shop_order_paid", { order_id: p.data.id, lines: shopLines, revenue: p.data.current_total_price ?? p.data.total_price ?? null, test: Boolean(p.data.test) }, { email: changed.owner_email, source: "shopify", actor: "system", ref: { type: "order", id: p.data.id } });
  }
  return { matched: Boolean(changed) };
}
