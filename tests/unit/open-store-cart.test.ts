import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { recordStoreOrderPaid } from "@/lib/open-store/cart";
import { sessionIdsFromOrder, storeCartAttributes, storeLineAttributes, visitorIdFromOrder } from "@/lib/open-store/order-lines";
import { RESERVED_PORTRAIT_KEYS } from "@/lib/shop/order-lines";
import { parseVariantRules } from "@/lib/shop/rules";
import { ShopCartFixtures } from "@/lib/shop/sources/cart";
import type { RawMetafield } from "@/lib/shop/sources/types";

const mf = (o: Record<string, string>): RawMetafield[] => Object.entries(o).map(([key, value]) => ({ key, value, type: "single_line_text_field", updatedAt: "2026-11-20T00:00:00Z" }));
const rules = (o: Record<string, string>) => {
  const r = parseVariantRules(mf(o));
  if (!r.ok) throw new Error("bad rules");
  return r.rules;
};

describe("open store: what goes on the order", () => {
  it("a fixture checkout carries exactly the open-store line and cart keys, never today's portrait keys", async () => {
    const carts = new ShopCartFixtures(async () => "59.99", async () => null);
    const lineId = randomUUID();
    const visitorId = randomUUID();
    const attributes = storeLineAttributes({
      lineId,
      picture: { imagenImageId: "img_1", sessionId: "sess_1", url: "https://imagen.example/images/a.png", width: 1536, height: 2048, theme: "admiral-01" },
      rules: rules({ maker: "prodigi", maker_sku: "GLOBAL-PIL-12", print_px: "3600x3600", placement: "cover" }),
      crop: { x: 0, y: 0, w: 1536, h: 1536 },
      previewUrl: "https://storage.example/signed/preview.jpg",
    });
    const cart = await carts.create({ lines: [{ merchandiseId: "gid://shopify/ProductVariant/1", quantity: 2, attributes }], email: null, discountCodes: [], attributes: storeCartAttributes(visitorId) });
    const sent = carts.calls[0].payload as { email: string | null; attributes: { key: string; value: string }[]; lines: { attributes: { key: string; value: string }[] }[] };
    expect(sent.email).toBeNull();
    expect(Object.fromEntries(sent.attributes.map((a) => [a.key, a.value]))).toEqual({ _source: "open_store", _open_store_visitor: visitorId });
    const line = Object.fromEntries(sent.lines[0].attributes.map((a) => [a.key, a.value]));
    expect(line).toEqual({
      _shop: "true",
      _shop_page: "open_store",
      _vault_line_id: lineId,
      _image_url: "https://imagen.example/images/a.png",
      _image_kind: "generated",
      _image_px: "1536x2048",
      _shop_image_id: "img_1",
      _shop_session_id: "sess_1",
      _shop_theme: "admiral-01",
      _shop_maker: "prodigi",
      _shop_maker_sku: "GLOBAL-PIL-12",
      _shop_print_px: "3600x3600",
      _shop_placement: "cover",
      _shop_crop: "0,0,1536,1536",
      _shop_rules_version: "2026-11-20T00:00:00Z",
      _shop_preview_url: "https://storage.example/signed/preview.jpg",
    });
    for (const k of RESERVED_PORTRAIT_KEYS) expect(line).not.toHaveProperty(k);
    expect(Object.keys(line).every((k) => k.startsWith("_"))).toBe(true);
    expect(cart.lines[0].quantity).toBe(2);
  });

  it("reads the visitor and the Imagen sessions back off a paid order", () => {
    const v = randomUUID();
    expect(visitorIdFromOrder([{ name: "_source", value: "open_store" }, { name: "_open_store_visitor", value: v }])).toBe(v);
    expect(visitorIdFromOrder([{ name: "_source", value: "shop" }, { name: "_open_store_visitor", value: v }])).toBeNull();
    expect(visitorIdFromOrder([{ name: "_source", value: "open_store" }, { name: "_open_store_visitor", value: "x' or 1=1" }])).toBeNull();
    expect(sessionIdsFromOrder([{ properties: [{ name: "_image_kind", value: "generated" }, { name: "_shop_session_id", value: "s1" }] }, { properties: [{ name: "_image_kind", value: "portrait" }, { name: "_shop_session_id", value: "s2" }] }, { properties: null }])).toEqual(["s1"]);
  });
});

describe("open store: orders/paid", () => {
  const email = `store-buyer-${randomBytes(4).toString("hex")}@example.com`;
  afterAll(async () => {
    await db().from("store_visitors").delete().eq("email", email);
    await db().from("vault_members").delete().eq("email", email);
  });

  it("marks the pictures ordered, links the visitor to the order's email, creates the member and clears the cart; a repeat changes nothing", async () => {
    const v = (await db().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex"), shopify_cart_id: "gid://shopify/Cart/fx9" }).select("id").single()).data as { id: string };
    const mine = (await db().from("store_generations").insert({ visitor_id: v.id, product_id: "gid://shopify/Product/8703000000", theme: "admiral-01", imagen_session_id: "sess_paid", status: "done" }).select("id").single()).data as { id: string };
    const other = (await db().from("store_visitors").insert({ token_hash: randomBytes(32).toString("hex") }).select("id").single()).data as { id: string };
    // Someone else's picture with the same session id is never touched by this order.
    const theirs = (await db().from("store_generations").insert({ visitor_id: other.id, product_id: "gid://shopify/Product/8703000000", theme: "admiral-01", imagen_session_id: "sess_paid", status: "done" }).select("id").single()).data as { id: string };
    const orderId = String(990_000_000 + Math.floor(Math.random() * 1_000_000));
    const order = {
      id: Number(orderId),
      name: "#9901",
      email: email.toUpperCase(),
      currency: "USD",
      current_total_price: "59.99",
      note_attributes: [
        { name: "_source", value: "open_store" },
        { name: "_open_store_visitor", value: v.id },
      ],
      line_items: [{ properties: [{ name: "_image_kind", value: "generated" }, { name: "_shop_session_id", value: "sess_paid" }] }],
    };
    expect(await recordStoreOrderPaid(order)).toEqual({ matched: true });
    const gen = (await db().from("store_generations").select("order_id, ordered_at").eq("id", mine.id).single()).data!;
    expect(gen.order_id).toBe(orderId);
    expect(gen.ordered_at).not.toBeNull();
    expect((await db().from("store_generations").select("order_id").eq("id", theirs.id).single()).data!.order_id).toBeNull();
    const visitor = (await db().from("store_visitors").select("email, linked_via, shopify_cart_id").eq("id", v.id).single()).data!;
    expect(visitor).toEqual({ email, linked_via: "order", shopify_cart_id: null });
    expect((await db().from("vault_members").select("created_via").eq("email", email).single()).data!.created_via).toBe("store_order");
    const paid = (await db().from("activity_log").select("props").eq("event", "store_order_paid").eq("ref_id", orderId)).data ?? [];
    expect(paid).toHaveLength(1);

    await recordStoreOrderPaid(order);
    expect((await db().from("activity_log").select("id").eq("event", "store_order_paid").eq("ref_id", orderId)).data).toHaveLength(1);
    await db().from("store_visitors").delete().eq("id", other.id);
  });

  it("ignores orders that aren't from the open store", async () => {
    expect(await recordStoreOrderPaid({ id: 1, note_attributes: [{ name: "_source", value: "shop" }], line_items: [] })).toEqual({ matched: false });
    expect(await recordStoreOrderPaid({ id: 1, note_attributes: [{ name: "_source", value: "open_store" }, { name: "_open_store_visitor", value: randomUUID() }], line_items: [] })).toEqual({ matched: false });
  });
});
