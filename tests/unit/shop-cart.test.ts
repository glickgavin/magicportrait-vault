import { describe, expect, it } from "vitest";
import { cartAttributes, cartIdFromOrder, lineAttributes, RESERVED_PORTRAIT_KEYS, sameAttrs } from "@/lib/shop/order-lines";
import { discounted, formatMoney, lowest, percentOff } from "@/lib/shop/money";
import { ShopCartFixtures } from "@/lib/shop/sources/cart";
import type { VariantRules } from "@/lib/shop/rules";
import type { DiscountInfo } from "@/lib/shop/sources/types";
import { parseRedeemOrder } from "@/lib/redeem/order";
import { canSeeShop } from "@/lib/shop/access";

const RULES: VariantRules = { maker: "prodigi", makerSku: "GLOBAL-POSTER-18X24", printPx: { w: 5400, h: 7200 }, zonePx: null, placement: "cover", minShortSidePx: 1800, maxCropPct: 30, adjustable: true, imageKinds: "both", background: null, extra: { sizing: "fillPrintArea" }, version: "2026-11-01T10:00:00Z" };
const LINE = "6b9f1c1e-7d2a-4c55-9e0a-5f9f2b9b0003";
const CART = "0b1f4c1e-7d2a-4c55-9e0a-5f9f2b9b0004";

describe("what goes on the order (docs/shop.md)", () => {
  const attrs = lineAttributes({
    lineId: LINE,
    page: "gifts",
    image: { kind: "portrait", url: "https://ngyunrirwrjudbgaijek.supabase.co/storage/v1/object/public/images/sessions/s/a.png", width: 2048, height: 2048, imageId: "img-1", sessionId: "sess-1" },
    rules: RULES,
    crop: { x: 205, y: 0, w: 1638, h: 2048 },
    previewUrl: "https://example.supabase.co/storage/v1/object/sign/shop-uploads/p/x.jpg?token=t",
  });
  const map = Object.fromEntries(attrs.map((a) => [a.key, a.value]));

  it("carries exactly the documented keys for a portrait on a cover print", () => {
    expect(Object.keys(map).sort()).toEqual(
      ["_shop", "_shop_page", "_vault_line_id", "_image_url", "_image_kind", "_image_px", "_shop_maker", "_shop_maker_sku", "_shop_print_px", "_shop_placement", "_shop_crop", "_shop_image_id", "_shop_session_id", "_shop_extra", "_shop_rules_version", "_shop_preview_url"].sort(),
    );
    expect(map).toMatchObject({ _shop: "true", _shop_page: "gifts", _vault_line_id: LINE, _image_kind: "portrait", _image_px: "2048x2048", _shop_maker: "prodigi", _shop_maker_sku: "GLOBAL-POSTER-18X24", _shop_print_px: "5400x7200", _shop_placement: "cover", _shop_crop: "205,0,1638,2048", _shop_image_id: "img-1", _shop_session_id: "sess-1", _shop_extra: '{"sizing":"fillPrintArea"}', _shop_rules_version: "2026-11-01T10:00:00Z" });
  });
  it("every key is hidden from the buyer and none is one of today's portrait keys", () => {
    for (const a of attrs) expect(a.key.startsWith("_"), a.key).toBe(true);
    for (const k of RESERVED_PORTRAIT_KEYS) expect(map[k], k).toBeUndefined();
  });
  it("adds the zone for a mug and the background for contain, and only those", () => {
    const mug = Object.fromEntries(lineAttributes({ lineId: LINE, page: "products", image: { kind: "upload", url: "https://x.example/a.jpg", width: 3000, height: 2000, imageId: null, sessionId: null }, rules: { ...RULES, placement: "wrap_zone", zonePx: { w: 1155, h: 1155 }, extra: {} }, crop: { x: 0, y: 0, w: 2000, h: 2000 }, previewUrl: null }).map((a) => [a.key, a.value]));
    expect(mug._shop_zone_px).toBe("1155x1155");
    expect(mug._shop_background).toBeUndefined();
    expect(mug._shop_extra).toBeUndefined();
    expect(mug._shop_image_id).toBeUndefined();
    expect(mug._shop_preview_url).toBeUndefined();
    const contain = Object.fromEntries(lineAttributes({ lineId: LINE, page: "products", image: { kind: "new_upload", url: "https://x.example/b.jpg", width: 3000, height: 2000, imageId: null, sessionId: null }, rules: { ...RULES, placement: "contain", background: "#FDE7FA" }, crop: { x: 0, y: 0, w: 3000, h: 2000 }, previewUrl: null }).map((a) => [a.key, a.value]));
    expect(contain._shop_background).toBe("#FDE7FA");
  });
  it("a shop line is never read as a portrait, mug or download by /redeem", () => {
    const parsed = parseRedeemOrder({
      id: "gid://shopify/Order/1",
      legacyId: "1",
      name: "#1001",
      createdAt: "2026-11-10T00:00:00Z",
      processedAt: null,
      cancelledAt: null,
      test: false,
      email: "sam@example.com",
      customer: null,
      financialStatus: "PAID",
      fulfillmentStatus: null,
      tags: [],
      statusPageUrl: null,
      total: null,
      mugChoice: null,
      lineItems: [{ id: "gid://shopify/LineItem/1", title: "Magic Poster", quantity: 1, currentQuantity: 1, unfulfilledQuantity: 1, productId: "gid://shopify/Product/9", productLegacyId: "9", variantId: null, variantLegacyId: null, customAttributes: attrs, imageUrl: null }],
    });
    expect(parsed.portraits).toEqual([]);
    expect(parsed.mug.present).toBe(false);
    expect(parsed.downloads.enabled).toBe(false);
  });
  it("cart attributes: our id and source, plus the gift details buyers see", () => {
    expect(cartAttributes({ cartId: CART, gift: null })).toEqual([
      { key: "_vault_cart_id", value: CART },
      { key: "_source", value: "shop" },
    ]);
    expect(cartAttributes({ cartId: CART, gift: { for: "Grandma Rose", message: "  " } })).toEqual([
      { key: "_vault_cart_id", value: CART },
      { key: "_source", value: "shop" },
      { key: "Gift for", value: "Grandma Rose" },
    ]);
    expect(cartAttributes({ cartId: CART, gift: { for: "Grandma Rose", message: "Love you" } }).at(-1)).toEqual({ key: "Gift message", value: "Love you" });
  });
  it("finds our cart on a paid order only when it came from the shop", () => {
    expect(cartIdFromOrder([{ name: "_source", value: "shop" }, { name: "_vault_cart_id", value: CART }])).toBe(CART);
    expect(cartIdFromOrder([{ name: "_vault_cart_id", value: CART }])).toBeNull();
    expect(cartIdFromOrder([{ name: "_source", value: "shop" }, { name: "_vault_cart_id", value: "'; drop table" }])).toBeNull();
    expect(cartIdFromOrder(null)).toBeNull();
  });
  it("compares attributes regardless of order", () => {
    expect(sameAttrs([{ key: "a", value: "1" }, { key: "b", value: "2" }], [{ key: "b", value: "2" }, { key: "a", value: "1" }])).toBe(true);
    expect(sameAttrs([{ key: "a", value: "1" }], [{ key: "a", value: "2" }])).toBe(false);
  });
});

describe("shop prices", () => {
  const info = (o: Partial<DiscountInfo> = {}): DiscountInfo => ({ code: "SITEWIDE OFF", status: "ACTIVE", title: "", percentage: 0.5, amount: null, collections: ["gid://shopify/Collection/328021508292"], combinesWithProduct: true, combinesWithOrder: true, combinesWithShipping: true, startsAt: "2026-01-11T00:00:00Z", endsAt: null, ...o });
  const store = "gid://shopify/Collection/328021508292";
  it("applies an active percentage code on the Store collection", () => {
    expect(percentOff(info(), store)).toBe(0.5);
    expect(percentOff(info({ collections: null }), store)).toBe(0.5);
  });
  it("shows no discount when the code is off, elsewhere, not started, ended or not a percentage", () => {
    expect(percentOff(null, store)).toBeNull();
    expect(percentOff(info({ status: "EXPIRED" }), store)).toBeNull();
    expect(percentOff(info({ collections: ["gid://shopify/Collection/1"] }), store)).toBeNull();
    expect(percentOff(info({ startsAt: "2999-01-01T00:00:00Z" }), store)).toBeNull();
    expect(percentOff(info({ endsAt: "2020-01-01T00:00:00Z" }), store)).toBeNull();
    expect(percentOff(info({ percentage: null, amount: { amount: "5.00", currency: "USD" } }), store)).toBeNull();
  });
  it("rounds to the cent", () => {
    expect(discounted("54.99", 0.5)).toBe("27.50");
    expect(discounted("39.99", 0.5)).toBe("20.00");
    expect(discounted("49.00", null)).toBeNull();
    expect(formatMoney("27.5", "USD")).toBe("$27.50");
    expect(lowest(["39.00", "29.00", "59.00"])).toBe("29.00");
  });
});

describe("Shopify carts (fixtures)", () => {
  const prices: Record<string, string> = { "gid://shopify/ProductVariant/1": "39.99", "gid://shopify/ProductVariant/2": "49.00" };
  const cart = () => new ShopCartFixtures(async (id) => prices[id] ?? null, async (code) => (code === "SITEWIDE OFF" ? 0.5 : null));
  it("creates a cart with the email, code and attributes, and prices it like Shopify", async () => {
    const c = cart();
    const r = await c.create({ lines: [{ merchandiseId: "gid://shopify/ProductVariant/1", quantity: 2, attributes: [{ key: "_vault_line_id", value: "l1" }] }], email: "sam@example.com", discountCodes: ["SITEWIDE OFF"], attributes: [{ key: "_vault_cart_id", value: CART }] });
    expect(r.subtotal.amount).toBe("79.98");
    expect(r.total.amount).toBe("39.99");
    expect(r.discountCodes).toEqual([{ code: "SITEWIDE OFF", applicable: true }]);
    expect(c.calls[0].op).toBe("cartCreate");
  });
  it("adds, changes and removes lines, and a wrong code doesn't apply", async () => {
    const c = cart();
    let r = await c.create({ lines: [], email: "sam@example.com", discountCodes: ["NOPE"], attributes: [] });
    r = await c.addLines(r.id, [{ merchandiseId: "gid://shopify/ProductVariant/2", quantity: 1, attributes: [] }]);
    expect(r.total.amount).toBe("49.00");
    expect(r.discountCodes[0].applicable).toBe(false);
    r = await c.updateLines(r.id, [{ id: r.lines[0].id, quantity: 3 }]);
    expect(r.total.amount).toBe("147.00");
    r = await c.removeLines(r.id, [r.lines[0].id]);
    expect(r.lines).toEqual([]);
    await expect(c.get("gid://shopify/Cart/missing")).resolves.toBeNull();
  });
});

describe("the shop stays hidden by default", () => {
  it("nobody sees it with both switches off", () => {
    expect(canSeeShop({ enabled: false, superUserPreview: false }, { isSuperUser: true })).toBe(false);
  });
});
