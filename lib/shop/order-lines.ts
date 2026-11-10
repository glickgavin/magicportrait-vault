/**
 * What goes on the order (docs/shop.md): the hidden line attributes the fulfilment system reads, and
 * the cart's attributes. Pure, so a test can pin the exact keys. Shop lines never carry today's portrait
 * keys (`_tile_id`, `_imagegen_session_id`, `_free_gift`, `_masterpiece`, `_addon`, `_theme`,
 * `_gelato_product_uid`), so /redeem and the existing print pipelines can't pick them up.
 */
import type { Attr } from "./sources/cart";
import type { ShopImageKind } from "./images";
import type { VariantRules } from "./rules";
import type { Rect } from "./fit";

export const RESERVED_PORTRAIT_KEYS = ["_tile_id", "_imagegen_session_id", "_free_gift", "_masterpiece", "_image_id", "_addon", "_theme", "_gelato_product_uid", "_mug_portrait_tile_id", "_tile_type"] as const;

export type LineAttrInput = {
  lineId: string;
  page: "gifts" | "products";
  image: { kind: ShopImageKind; url: string; width: number; height: number; imageId: string | null; sessionId: string | null };
  rules: VariantRules;
  crop: Rect;
  previewUrl: string | null;
};

export function lineAttributes(i: LineAttrInput): Attr[] {
  const a: Attr[] = [
    { key: "_shop", value: "true" },
    { key: "_shop_page", value: i.page },
    { key: "_vault_line_id", value: i.lineId },
    { key: "_image_url", value: i.image.url },
    { key: "_image_kind", value: i.image.kind },
    { key: "_image_px", value: `${i.image.width}x${i.image.height}` },
    { key: "_shop_maker", value: i.rules.maker },
    { key: "_shop_maker_sku", value: i.rules.makerSku },
    { key: "_shop_print_px", value: `${i.rules.printPx.w}x${i.rules.printPx.h}` },
    { key: "_shop_placement", value: i.rules.placement },
    { key: "_shop_crop", value: `${i.crop.x},${i.crop.y},${i.crop.w},${i.crop.h}` },
  ];
  if (i.image.kind === "portrait" && i.image.imageId) a.push({ key: "_shop_image_id", value: i.image.imageId });
  if (i.image.kind === "portrait" && i.image.sessionId) a.push({ key: "_shop_session_id", value: i.image.sessionId });
  if (i.rules.placement === "wrap_zone" && i.rules.zonePx) a.push({ key: "_shop_zone_px", value: `${i.rules.zonePx.w}x${i.rules.zonePx.h}` });
  if (i.rules.placement === "contain") a.push({ key: "_shop_background", value: i.rules.background ?? "#FFFFFF" });
  if (Object.keys(i.rules.extra).length) a.push({ key: "_shop_extra", value: JSON.stringify(i.rules.extra) });
  if (i.rules.version) a.push({ key: "_shop_rules_version", value: i.rules.version });
  if (i.previewUrl) a.push({ key: "_shop_preview_url", value: i.previewUrl });
  return a;
}

export type CartAttrInput = { cartId: string; gift: { for: string; message: string } | null };

/** Cart attributes: ours, plus the gift details buyers can see in checkout when the cart holds gifts. */
export function cartAttributes(i: CartAttrInput): Attr[] {
  const a: Attr[] = [
    { key: "_vault_cart_id", value: i.cartId },
    { key: "_source", value: "shop" },
  ];
  if (i.gift) {
    a.push({ key: "Gift for", value: i.gift.for });
    if (i.gift.message.trim()) a.push({ key: "Gift message", value: i.gift.message.trim() });
  }
  return a;
}

/** The cart id on a paid order's note attributes, if it came from the shop. */
export function cartIdFromOrder(noteAttributes: { name: string; value: string | null }[] | null | undefined): string | null {
  const src = noteAttributes?.find((n) => n.name === "_source")?.value;
  const id = noteAttributes?.find((n) => n.name === "_vault_cart_id")?.value;
  if (src !== "shop" || !id) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : null;
}

export const sameAttrs = (a: Attr[], b: Attr[]) => JSON.stringify([...a].sort((x, y) => x.key.localeCompare(y.key))) === JSON.stringify([...b].sort((x, y) => x.key.localeCompare(y.key)));
