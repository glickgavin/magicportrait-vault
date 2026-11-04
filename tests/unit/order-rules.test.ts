import { describe, expect, it } from "vitest";
import { attrMap, dedupeByTile, isPaidOrder, lineTileId, orderCounts, orderUnlocksGift, parseRedeemOrder } from "@/lib/redeem/order";
import type { ShopifyLineItem, ShopifyOrder } from "@/lib/sources/types";

const L = (attrs: Record<string, string>, extra: Partial<ShopifyLineItem> = {}): ShopifyLineItem => ({
  id: `gid://shopify/LineItem/${Math.floor(Math.random() * 1e9)}`,
  title: "x",
  quantity: 1,
  currentQuantity: 1,
  unfulfilledQuantity: 1,
  productId: null,
  productLegacyId: null,
  variantId: null,
  variantLegacyId: null,
  customAttributes: Object.entries(attrs).map(([key, value]) => ({ key, value })),
  imageUrl: null,
  ...extra,
});
const O = (lines: ShopifyLineItem[], extra: Partial<ShopifyOrder> = {}): ShopifyOrder => ({
  id: "gid://shopify/Order/1",
  legacyId: "1",
  name: "#1",
  createdAt: "2026-10-01T00:00:00Z",
  processedAt: null,
  cancelledAt: null,
  test: false,
  email: "a@example.com",
  customer: null,
  financialStatus: "PAID",
  fulfillmentStatus: "UNFULFILLED",
  tags: [],
  statusPageUrl: null,
  total: null,
  mugChoice: null,
  lineItems: lines,
  ...extra,
});

describe("lineTileId (§6.3)", () => {
  it("prefers _tile_id", () => expect(lineTileId({ _tile_id: "t", _masterpiece: "true", _image_id: "i" })).toBe("t"));
  it("falls back to _image_id only on Masterpiece lines", () => {
    expect(lineTileId({ _masterpiece: "true", _image_id: "i" })).toBe("i");
    expect(lineTileId({ _image_id: "i" })).toBeUndefined();
  });
  it("later duplicate attribute keys win", () => expect(attrMap([{ key: "a", value: "1" }, { key: "a", value: "2" }]).a).toBe("2"));
});

describe("parseRedeemOrder (§6.2)", () => {
  it("downloads: each of the three products", () => {
    for (const p of ["8596065026244", "8629738045636", "8801988214980"]) {
      expect(parseRedeemOrder(O([L({}, { productId: `gid://shopify/Product/${p}` })])).downloads.enabled).toBe(true);
    }
  });
  it("downloads: hi-res add-on attribute", () => expect(parseRedeemOrder(O([L({ _addon: "hires_download" })])).downloads.enabled).toBe(true));
  it("downloads: every Masterpiece line", () => expect(parseRedeemOrder(O([L({ _masterpiece: "true" })])).downloads.enabled).toBe(true));
  it("downloads: off for prints only", () => expect(parseRedeemOrder(O([L({ _tile_id: "t", _image_url: "u" })])).downloads.enabled).toBe(false));
  it("mug: present only with _free_gift=magic_mug", () => {
    expect(parseRedeemOrder(O([L({ _free_gift: "magic_mug" })])).mug.present).toBe(true);
    expect(parseRedeemOrder(O([L({ _free_gift: "other" })])).mug.present).toBe(false);
  });
  it("mug: metafield choice beats the line attribute; none_selected means null", () => {
    const mug = L({ _free_gift: "magic_mug", _mug_portrait_tile_id: "line-tile" });
    expect(parseRedeemOrder(O([mug])).mug.currentTileId).toBe("line-tile");
    expect(parseRedeemOrder(O([mug], { mugChoice: { value: '{"tile_id":"mf-tile"}', updatedAt: null, compareDigest: null } })).mug.currentTileId).toBe("mf-tile");
    expect(parseRedeemOrder(O([L({ _free_gift: "magic_mug", _mug_portrait_tile_id: "none_selected" })])).mug.currentTileId).toBeNull();
    expect(parseRedeemOrder(O([mug], { mugChoice: { value: "not json", updatedAt: null, compareDigest: null } })).mug.currentTileId).toBe("line-tile");
  });
  it("portraits: need an image URL and a tile id, never the mug line; duplicates kept", () => {
    const p = parseRedeemOrder(
      O([
        L({ _tile_id: "a", _image_url: "u1", _theme: "Royal" }),
        L({ _tile_id: "a", _image_url: "u2" }),
        L({ _masterpiece: "true", _image_id: "m", _image_url: "u3" }),
        L({ _tile_id: "", _image_url: "u4" }),
        L({ _tile_id: "b" }),
        L({ _free_gift: "magic_mug", _tile_id: "c", _image_url: "u5" }),
        L({ _tile_id: "photo", _image_url: "u6", _tile_type: "photo" }),
      ]),
    );
    expect(p.portraits.map((x) => x.tileId)).toEqual(["a", "a", "m", "photo"]);
    expect(p.portraits[2].tileType).toBe("masterpiece");
    expect(dedupeByTile(p.portraits).map((x) => [x.tileId, x.imageUrl])).toEqual([["a", "u2"], ["m", "u3"], ["photo", "u6"]]);
  });
  it("reads every line, not just the first 50", () => {
    const lines = Array.from({ length: 120 }, (_, i) => L({ _tile_id: `t${i}`, _image_url: "u" }));
    lines.push(L({ _free_gift: "magic_mug" }));
    const p = parseRedeemOrder(O(lines));
    expect(p.portraits).toHaveLength(120);
    expect(p.mug.present).toBe(true);
  });
});

describe("order status rules", () => {
  it("cancelled, refunded and voided orders don't count", () => {
    expect(orderCounts({ cancelledAt: null, financialStatus: "PAID" })).toBe(true);
    expect(orderCounts({ cancelledAt: "2026-01-01", financialStatus: "PAID" })).toBe(false);
    expect(orderCounts({ cancelledAt: null, financialStatus: "REFUNDED" })).toBe(false);
    expect(orderCounts({ cancelledAt: null, financialStatus: "VOIDED" })).toBe(false);
    expect(orderCounts({ cancelledAt: null, financialStatus: "PARTIALLY_REFUNDED" })).toBe(true);
  });
  it("is a customer: paid, partly paid or partly refunded, not cancelled", () => {
    expect(isPaidOrder({ cancelledAt: null, financialStatus: "PAID" })).toBe(true);
    expect(isPaidOrder({ cancelledAt: null, financialStatus: "PENDING" })).toBe(false);
    expect(isPaidOrder({ cancelledAt: null, financialStatus: "PARTIALLY_PAID" })).toBe(true);
  });
  it("gift unlock rule", () => {
    const o = O([L({}, { productLegacyId: "123456" })]);
    expect(orderUnlocksGift(o, "any_paid_order", [])).toBe(true);
    expect(orderUnlocksGift(o, "qualifying_products", ["123456"])).toBe(true);
    expect(orderUnlocksGift(o, "qualifying_products", ["999999"])).toBe(false);
    expect(orderUnlocksGift({ ...o, cancelledAt: "x" }, "any_paid_order", [])).toBe(false);
  });
});
