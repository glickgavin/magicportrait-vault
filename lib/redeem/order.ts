/**
 * Pure order rules. docs/data.md §3.6, §5.2 and §6. No I/O here, so every row of the rules is unit-tested.
 */
import type { Attr, ShopifyOrder } from "@/lib/sources/types";

export type RedeemConfig = {
  downloadProductIds: string[];
  hiresAttrKey: string;
  hiresAttrValue: string;
  masterpieceAttrKey: string;
  masterpieceAttrValue: string;
  mugAttrKey: string;
  mugAttrValue: string;
  mugLineTileAttrKey: string;
  noneSelected: string;
  tileIdKey: string;
  masterpieceImageIdKey: string;
  imageUrlKey: string;
  themeKey: string;
};

export const DEFAULT_REDEEM_CONFIG: RedeemConfig = {
  downloadProductIds: ["8596065026244", "8629738045636", "8801988214980"],
  hiresAttrKey: "_addon",
  hiresAttrValue: "hires_download",
  masterpieceAttrKey: "_masterpiece",
  masterpieceAttrValue: "true",
  mugAttrKey: "_free_gift",
  mugAttrValue: "magic_mug",
  mugLineTileAttrKey: "_mug_portrait_tile_id",
  noneSelected: "none_selected",
  tileIdKey: "_tile_id",
  masterpieceImageIdKey: "_image_id",
  imageUrlKey: "_image_url",
  themeKey: "_theme",
};

export function attrMap(attrs: Attr[] | null | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const a of attrs ?? []) m[a.key] = a.value; // a later duplicate key wins
  return m;
}

/** §6.3: lineTileId = _tile_id ?? (_masterpiece === "true" ? _image_id : undefined) */
export function lineTileId(a: Record<string, string>, cfg: RedeemConfig = DEFAULT_REDEEM_CONFIG): string | undefined {
  return a[cfg.tileIdKey] ?? (a[cfg.masterpieceAttrKey] === cfg.masterpieceAttrValue ? a[cfg.masterpieceImageIdKey] : undefined);
}

export type RedeemPortrait = { tileId: string; imageUrl: string; theme: string | null; size: string | null; tileType: string | null; lineItemId: string };

export type ParsedOrder = {
  orderName: string;
  orderId: string;
  portraits: RedeemPortrait[];
  mug: { present: boolean; currentTileId: string | null; lineItemId: string | null };
  downloads: { enabled: boolean };
};

/** Faithful port of the live redeem-get-order parser (docs/data.md §6.2), reading ALL lines. */
export function parseRedeemOrder(order: ShopifyOrder, cfg: RedeemConfig = DEFAULT_REDEEM_CONFIG): ParsedOrder {
  const downloadGids = new Set(cfg.downloadProductIds.map((id) => `gid://shopify/Product/${id}`));
  const portraits: RedeemPortrait[] = [];
  let mugPresent = false;
  let mugLineCurrentTileId: string | null = null;
  let mugLineItemId: string | null = null;
  let downloadsEnabled = false;

  for (const ln of order.lineItems) {
    const a = attrMap(ln.customAttributes);
    if (ln.productId && downloadGids.has(ln.productId)) downloadsEnabled = true;
    if (a[cfg.hiresAttrKey] === cfg.hiresAttrValue) downloadsEnabled = true;
    if (a[cfg.masterpieceAttrKey] === cfg.masterpieceAttrValue) downloadsEnabled = true;
    if (a[cfg.mugAttrKey] === cfg.mugAttrValue) {
      mugPresent = true;
      mugLineItemId = ln.id;
      const t = a[cfg.mugLineTileAttrKey];
      mugLineCurrentTileId = t && t !== cfg.noneSelected ? t : null;
    }
    const tileId = lineTileId(a, cfg);
    if (a[cfg.imageUrlKey] && tileId && a[cfg.mugAttrKey] !== cfg.mugAttrValue) {
      portraits.push({
        tileId,
        imageUrl: a[cfg.imageUrlKey],
        theme: a[cfg.themeKey] ?? null,
        size: a._size ?? null,
        tileType: a._tile_type ?? (a[cfg.masterpieceAttrKey] === cfg.masterpieceAttrValue ? "masterpiece" : null),
        lineItemId: ln.id,
      });
    }
  }

  let currentTileId: string | null = null;
  const mf = order.mugChoice?.value;
  if (mf) {
    try {
      const p = JSON.parse(mf) as { tile_id?: unknown };
      if (p?.tile_id) currentTileId = String(p.tile_id);
    } catch {
      /* ignore */
    }
  }
  if (!currentTileId) currentTileId = mugLineCurrentTileId;

  return {
    orderName: order.name,
    orderId: String(order.legacyId),
    portraits,
    mug: { present: mugPresent, currentTileId, lineItemId: mugLineItemId },
    downloads: { enabled: downloadsEnabled },
  };
}

/** §6.4: the picker lists portraits deduped by tileId, first-appearance order, last duplicate's data. */
export function dedupeByTile(portraits: RedeemPortrait[]): RedeemPortrait[] {
  const m = new Map<string, RedeemPortrait>();
  for (const p of portraits) m.set(p.tileId, p);
  return [...m.values()];
}

/** §3.6: cancelled, refunded and voided orders never count. */
export function orderCounts(o: Pick<ShopifyOrder, "cancelledAt" | "financialStatus">): boolean {
  return !o.cancelledAt && o.financialStatus !== "REFUNDED" && o.financialStatus !== "VOIDED";
}

/** §5.2: "is a customer" = at least one paid (or partly paid/refunded) order that isn't cancelled. */
export function isPaidOrder(o: Pick<ShopifyOrder, "cancelledAt" | "financialStatus">): boolean {
  return !o.cancelledAt && (o.financialStatus === "PAID" || o.financialStatus === "PARTIALLY_REFUNDED" || o.financialStatus === "PARTIALLY_PAID");
}

/** SPEC §8.3: which orders unlock the free gift. */
export function orderUnlocksGift(o: ShopifyOrder, rule: "any_paid_order" | "qualifying_products", productIds: string[]): boolean {
  if (!isPaidOrder(o)) return false;
  if (rule === "any_paid_order") return true;
  const wanted = new Set(productIds);
  return o.lineItems.some((l) => l.productLegacyId && wanted.has(l.productLegacyId));
}

export function legacyIdOf(gid: string): string {
  return gid.split("/").pop() ?? gid;
}
