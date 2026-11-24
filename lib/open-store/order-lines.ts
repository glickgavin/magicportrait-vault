/**
 * What an open-store line carries on the order (docs/open-store.md › Cart and checkout): the keys in
 * docs/shop.md › What goes on the order, with `_image_kind` = `generated`, the Imagen ids, Imagen's public
 * picture URL and the theme. The cart carries `_source` = `open_store` and the visitor id. Never today's
 * portrait keys. Pure, so a test can pin the exact keys.
 */
import type { Rect } from "@/lib/shop/fit";
import type { VariantRules } from "@/lib/shop/rules";
import type { Attr } from "@/lib/shop/sources/cart";

export type StoreLineInput = {
  lineId: string;
  picture: { imagenImageId: string; sessionId: string; url: string; width: number; height: number; theme: string };
  rules: VariantRules;
  crop: Rect;
  previewUrl: string | null;
};

export function storeLineAttributes(i: StoreLineInput): Attr[] {
  const a: Attr[] = [
    { key: "_shop", value: "true" },
    { key: "_shop_page", value: "open_store" },
    { key: "_vault_line_id", value: i.lineId },
    { key: "_image_url", value: i.picture.url },
    { key: "_image_kind", value: "generated" },
    { key: "_image_px", value: `${i.picture.width}x${i.picture.height}` },
    { key: "_shop_image_id", value: i.picture.imagenImageId },
    { key: "_shop_session_id", value: i.picture.sessionId },
    { key: "_shop_theme", value: i.picture.theme },
    { key: "_shop_maker", value: i.rules.maker },
    { key: "_shop_maker_sku", value: i.rules.makerSku },
    { key: "_shop_print_px", value: `${i.rules.printPx.w}x${i.rules.printPx.h}` },
    { key: "_shop_placement", value: i.rules.placement },
    { key: "_shop_crop", value: `${i.crop.x},${i.crop.y},${i.crop.w},${i.crop.h}` },
  ];
  if (i.rules.placement === "wrap_zone" && i.rules.zonePx) a.push({ key: "_shop_zone_px", value: `${i.rules.zonePx.w}x${i.rules.zonePx.h}` });
  if (i.rules.placement === "contain") a.push({ key: "_shop_background", value: i.rules.background ?? "#FFFFFF" });
  if (Object.keys(i.rules.extra).length) a.push({ key: "_shop_extra", value: JSON.stringify(i.rules.extra) });
  if (i.rules.version) a.push({ key: "_shop_rules_version", value: i.rules.version });
  if (i.previewUrl) a.push({ key: "_shop_preview_url", value: i.previewUrl });
  return a;
}

export function storeCartAttributes(visitorId: string): Attr[] {
  return [
    { key: "_source", value: "open_store" },
    { key: "_open_store_visitor", value: visitorId },
  ];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The visitor id on a paid order's note attributes, if it came from the open store. */
export function visitorIdFromOrder(noteAttributes: { name: string; value: string | null }[] | null | undefined): string | null {
  if (noteAttributes?.find((n) => n.name === "_source")?.value !== "open_store") return null;
  const id = noteAttributes?.find((n) => n.name === "_open_store_visitor")?.value ?? "";
  return UUID.test(id) ? id : null;
}

/** Imagen session ids on the order's open-store lines (to mark those pictures ordered). */
export function sessionIdsFromOrder(lines: { properties?: { name: string; value: string | null }[] | null }[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const l of lines ?? []) {
    const props = l.properties ?? [];
    if (props.find((p) => p.name === "_image_kind")?.value !== "generated") continue;
    const s = props.find((p) => p.name === "_shop_session_id")?.value;
    if (s) out.add(s);
  }
  return [...out];
}
