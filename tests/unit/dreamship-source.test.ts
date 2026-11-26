import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDef, validateSetting } from "@/lib/settings/registry";
import { DreamshipError, DreamshipFixtures, DreamshipLive, PATHS, createProductBody, parseAccount, parseCloneSource, parseListing, parseOrder, parseProduct, parseProductPage, parseShops } from "@/lib/sources/dreamship";

describe("Dreamship source: fixtures", () => {
  it("reads the account and Dreamship's own order settings", async () => {
    const ds = new DreamshipFixtures();
    expect(await ds.account()).toEqual({ businessName: "Storyboards Inc", plan: "basic", settings: { autoImportOrders: true, autoSubmitImportOrders: true, autoSubmitApiOrders: true } });
  });

  it("reads the Flush poster's design and the catalog item's print areas and production days", async () => {
    const ds = new DreamshipFixtures();
    const p = (await ds.product(9972256))!;
    expect(p.itemId).toBe(958);
    expect(p.variants.map((v) => [v.productVariantId, v.itemVariantId, v.cost])).toEqual([
      [45378125, 17383, "22.99"],
      [45378127, 17398, "32.19"],
      [45378126, 17418, "64.79"],
      [45378124, 17428, "135.69"],
    ]);
    const item = (await ds.catalogItem(958))!;
    expect([item.productionDaysMin, item.productionDaysMax]).toEqual([1, 3]);
    expect(item.printAreas.find((a) => a.key === "8x10")).toMatchObject({ widthPx: 1800, heightPx: 2400, minDpi: 250 });
    expect(await ds.product(1)).toBeNull();
    expect(await ds.catalogItem(1)).toBeNull();
  });

  it("finds an imported order by reference only once Dreamship has imported it", async () => {
    const ds = new DreamshipFixtures();
    expect(await ds.orderByReference("5001")).toBeNull();
    ds.importOrder("5001", [{ productVariantId: 45378125 }], { importAfterPolls: 1 });
    expect(await ds.orderByReference("5001")).toBeNull();
    const o = (await ds.orderByReference("5001"))!;
    expect(o).toMatchObject({ referenceId: "5001", status: "draft" });
    expect(o.lineItems[0].printAreas).toEqual([{ key: "8x10", artworkId: 10669431 }]);
  });

  it("uploads artwork and sets it on a draft's line; a submitted order refuses", async () => {
    const ds = new DreamshipFixtures();
    const o = ds.importOrder("5002", [{ productVariantId: 45378127 }]);
    const art = await ds.uploadArtwork({ url: "https://storage.example/print.jpg?token=x", name: "order-5002-line-1" });
    await ds.setLineArtwork(o.id, o.lineItems[0].id, { printArea: "12x16", artworkId: art.id });
    expect((await ds.orderByReference("5002"))!.lineItems[0].printAreas).toEqual([{ key: "12x16", artworkId: art.id }]);
    ds.setOrderStatus("5002", "accepted");
    await expect(ds.setLineArtwork(o.id, o.lineItems[0].id, { printArea: "12x16", artworkId: art.id })).rejects.toMatchObject({ code: "not_editable" });
    // The signed link's token is never recorded.
    expect(JSON.stringify(ds.calls)).not.toContain("token=");
  });
});

describe("Dreamship source: never submits, cancels or changes status (CLAUDE.md allowed write 7)", () => {
  const forbidden = /submit|cancel|status|reprocess|delete|refund/i;
  it("neither implementation has such a method", () => {
    for (const C of [DreamshipFixtures, DreamshipLive]) {
      const methods = Object.getOwnPropertyNames(C.prototype).filter((m) => m !== "constructor" && m !== "setOrderStatus");
      expect(methods.filter((m) => forbidden.test(m)), C.name).toEqual([]);
    }
  });
  it("the live paths reach no submit or cancel endpoint, and the live client only writes artwork", () => {
    const paths = Object.values(PATHS).map((p) => (typeof p === "function" ? (p as (...a: unknown[]) => string)(1, 2) : p));
    expect(paths.filter((p) => forbidden.test(p))).toEqual([]);
    const src = readFileSync("lib/sources/dreamship.ts", "utf8");
    const writes = [...src.matchAll(/method: "(POST|PUT|PATCH|DELETE)"/g)].map((m) => m[1]);
    // The line's artwork (PATCH), the artwork upload (POST) and, since 26 Nov, a cloned product (POST; allowed write 8).
    expect(writes.sort()).toEqual(["PATCH", "POST", "POST"]);
    expect(src).not.toMatch(/method: "DELETE"/);
  });
});

describe("cloning a product (allowed write 8)", () => {
  const body = {
    id: 9986009,
    name: "Fleece Blanket Master",
    description: "Soft fleece.",
    item: { id: 18, name: "Fleece Blanket" },
    primary_color: { id: 7, name: "White" },
    product_tags: ["blanket"],
    personalized: false,
    product_variants: [
      { id: 45392982, item_variant: 746, price: "49.9" },
      { id: 45392983, item_variant: 747, price: "69.99" },
    ],
    print_areas: [
      { key: "30x40", url: "https://cdn.example/a.png", resize: "fill", position: "center_center", rotate: 0, ai_upscale: true },
      { key: "bad", url: "javascript:alert(1)" },
    ],
    shop_products: [{ marketplace_id: 8914933874884, publish_status: "published", shop: { key: "shop_abc", channel: "shopify" } }],
  };

  it("reads what a copy needs from the master", () => {
    const src = parseCloneSource(body, 9986009)!;
    expect(src).toMatchObject({ itemId: 18, primaryColorId: 7, shopKeys: ["shop_abc"], tags: ["blanket"] });
    expect(src.variants).toEqual([
      { itemVariantId: 746, price: "49.90" },
      { itemVariantId: 747, price: "69.99" },
    ]);
    // Only artwork at an https address is carried over.
    expect(src.printAreas.map((a) => a.key)).toEqual(["30x40"]);
    expect(parseCloneSource({ name: "no item" }, 1)).toBeNull();
  });

  it("makes the new product a draft in the same shops, with the same sizes, prices and artwork", () => {
    const out = createProductBody(parseCloneSource(body, 9986009)!, 'Fleece Blanket "Watercolor"');
    expect(out).toEqual({
      item: 18,
      name: 'Fleece Blanket "Watercolor"',
      description: "Soft fleece.",
      primary_color: 7,
      product_tags: ["blanket"],
      item_variants: [
        { id: 746, price: "49.90" },
        { id: 747, price: "69.99" },
      ],
      print_areas: [{ key: "30x40", url: "https://cdn.example/a.png", resize: "fill", position: "center_center", ai_upscale: true }],
      shops: ["shop_abc"],
      personalized: false,
      marketplace_draft: true,
    });
  });

  it("knows when Dreamship has listed it in Shopify", () => {
    expect(parseListing(body)).toEqual({ shopifyProductId: "8914933874884", status: "published", error: null });
    expect(parseListing({ process_status: "processing", shop_products: [] })).toEqual({ shopifyProductId: null, status: "processing", error: null });
    expect(parseListing({ shop_products: [{ publish_status: "failed", error_reason: "shop_disconnected", shop: {} }] })).toEqual({ shopifyProductId: null, status: "failed", error: "shop_disconnected" });
  });

  it("the fixtures list a new product in Shopify on the second look", async () => {
    const ds = new DreamshipFixtures();
    const { id } = await ds.createProduct((await ds.cloneSource(9972256))!, "Copy");
    expect((await ds.shopifyIdOf(id))!.shopifyProductId).toBeNull();
    expect((await ds.shopifyIdOf(id))!.shopifyProductId).toBe("8710000000");
  });
});

describe("Dreamship responses", () => {
  it("reads a product design in Dreamship's shape", () => {
    const p = parseProduct(
      {
        product_id: 9972256,
        name: "Flush",
        item_id: 958,
        status: "processed",
        print_areas: [{ key: "8x10", width_px: 1800, height_px: 2400, artwork_id: 10669431, dpi: 146, min_dpi: 250, ai_upscale: false }],
        variants: [{ product_variant_id: 45378125, item_variant_id: 17383, size: '8x10"', color: "Black", retail_price: "59.99", cost: "22.99" }],
      },
      9972256,
    )!;
    expect(p).toMatchObject({ id: 9972256, itemId: 958, url: "https://app.dreamship.com/app/products/9972256" });
    expect(p.variants[0]).toEqual({ productVariantId: 45378125, itemVariantId: 17383, size: '8x10"', color: "Black", price: "59.99", cost: "22.99" });
    expect(p.printAreas[0]).toMatchObject({ key: "8x10", widthPx: 1800, minDpi: 250, artworkId: 10669431, aiUpscale: false });
    expect(parseProduct("nope", 1)).toBeNull();
  });
  it("reads an order and the business settings", () => {
    const o = parseOrder({ id: 9, reference_id: "5003", status: "draft", line_items: [{ id: 90, product_variant_id: 45378125, quantity: 2, print_areas: [{ key: "8x10", artwork_id: 1 }] }] })!;
    expect(o.lineItems[0]).toEqual({ id: 90, productVariantId: 45378125, itemVariantId: null, quantity: 2, printAreas: [{ key: "8x10", artworkId: 1 }] });
    expect(parseAccount({ business_name: "Storyboards Inc", subscription_plan: "basic" }, { auto_submit_order_import_orders: true, auto_submit_api_orders: false })).toEqual({ businessName: "Storyboards Inc", plan: "basic", settings: { autoImportOrders: null, autoSubmitImportOrders: true, autoSubmitApiOrders: false } });
  });
  it("reads the account from the shop list (Dreamship's API has no account endpoint)", () => {
    expect(parseShops({ count: 1, results: [{ id: 15218, name: "Storyboards", channel: "Shopify" }] })).toEqual({ businessName: "Storyboards (Shopify)", plan: null, settings: { autoImportOrders: null, autoSubmitImportOrders: null, autoSubmitApiOrders: null } });
    expect(parseShops([{ id: 1, shop_name: "Etsy shop" }]).businessName).toBe("Etsy shop");
    expect(parseShops({ results: [] }).businessName).toBe("Connected (no shops)");
    expect(parseShops({ data: [{ id: 15218, name: "Storyboards", channel: "shopify" }] }).businessName).toBe("Storyboards (shopify)");
  });
  it("a refusal is a DreamshipError with a code", () => {
    expect(new DreamshipError("x", "not_editable", 400)).toMatchObject({ code: "not_editable", status: 400 });
  });
});

// Shapes from Dreamship's API reference (docs.dreamship.com/reference: retrieveproduct, listproducts, retrieveitem,
// retrieveorder), trimmed to the fields the app reads. Made-up ids.
const REST_PRODUCT = {
  id: 9986009,
  name: "Fleece Blanket",
  item: { id: 18, name: "Fleece Blanket" },
  status: "active",
  product_variants: [
    { id: 45392982, item_variant: 746, size: "30x40in", color: "White", cost: "18.50", price: "49.99", option_values: [] },
    { id: 45392983, item_variant: 747, size: "50x60in", color: "White", cost: "24.00", price: "69.99", option_values: [] },
  ],
  print_areas: [{ key: "30x40", name: "30x40", url: "https://cdn.example/art.png", artwork_left: 0 }],
  shop_products: [{ marketplace_id: 8919760109764, shop: { id: 1, name: "Shop" } }],
};
const REST_ITEM = {
  id: 18,
  name: "Fleece Blanket",
  production_days_min: 1,
  production_days_max: 3,
  print_areas: [
    { key: "30x40", w: 5100, h: 6600, dpi: 150 },
    { key: "50x60", w: 8100, h: 9600, dpi: 150 },
  ],
};

describe("Dreamship's REST shapes", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads a product as the API returns it: product_variants, item.id, print areas without sizes", () => {
    const p = parseProduct(REST_PRODUCT, 9986009)!;
    expect(p).toMatchObject({ id: 9986009, itemId: 18, name: "Fleece Blanket", status: "active" });
    expect(p.variants).toEqual([
      { productVariantId: 45392982, itemVariantId: 746, size: "30x40in", color: "White", price: "49.99", cost: "18.50" },
      { productVariantId: 45392983, itemVariantId: 747, size: "50x60in", color: "White", price: "69.99", cost: "24.00" },
    ]);
    // The product's own print areas carry no pixel size; the catalog item's do.
    expect(p.printAreas).toEqual([]);
    // An item variant given as an object is read by its id.
    expect(parseProduct({ ...REST_PRODUCT, product_variants: [{ id: 1, item_variant: { id: 7 } }] }, 1)!.variants[0]).toMatchObject({ productVariantId: 1, itemVariantId: 7 });
  });

  it("reads a page of the product list, with the Shopify product it's listed on", () => {
    expect(parseProductPage({ paging: { count: 2, next: "https://api.example/v1/products/?page=2", previous: null }, data: [REST_PRODUCT, { id: 5, product_variants: [] }] })).toEqual({
      products: [
        { id: 9986009, shopifyIds: ["8919760109764"], variantIds: [45392982, 45392983] },
        { id: 5, shopifyIds: [], variantIds: [] },
      ],
      next: true,
    });
    expect(parseProductPage({ paging: { next: null }, data: [] })).toEqual({ products: [], next: false });
    expect(parseProductPage("nope")).toEqual({ products: [], next: false });
  });

  it("reads an order's lines by product_variant", () => {
    const o = parseOrder({ id: 9, reference_id: "5003", status: "draft", line_items: [{ id: 90, product_variant: 45392982, item_variant: 746, quantity: 1, print_areas: [] }] })!;
    expect(o.lineItems[0]).toMatchObject({ productVariantId: 45392982, itemVariantId: 746 });
  });

  it("the live client reads an item's print areas (w, h) and finds a product by its Shopify id or a SKU", async () => {
    const calls: string[] = [];
    const page2 = { paging: { next: null }, data: [{ id: 7777, product_variants: [{ id: 111 }], shop_products: [] }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url.replace("https://api.example/v1", ""));
        const body = url.includes("/items/18/") ? REST_ITEM : url.includes("page=1") ? { paging: { next: "x" }, data: [REST_PRODUCT] } : url.includes("page=2") ? page2 : null;
        return new Response(body ? JSON.stringify(body) : "", { status: body ? 200 : 404 });
      }),
    );
    const ds = new DreamshipLive({ url: "https://api.example/v1", key: "k" });
    const item = (await ds.catalogItem(18))!;
    expect(item).toMatchObject({ productionDaysMin: 1, productionDaysMax: 3 });
    expect(item.printAreas).toEqual([
      { key: "30x40", widthPx: 5100, heightPx: 6600, dpi: 150, minDpi: null },
      { key: "50x60", widthPx: 8100, heightPx: 9600, dpi: 150, minDpi: null },
    ]);
    expect(await ds.findProduct({ shopifyProductId: "8919760109764" })).toBe(9986009);
    expect(await ds.findProduct({ variantIds: [111] })).toBe(7777);
    expect(await ds.productForVariant(45392983)).toBe(9986009);
    expect(await ds.findProduct({ shopifyProductId: "1", variantIds: [2] })).toBeNull();
    // The list is read once (two pages), however many lookups follow.
    expect(calls).toEqual(["/items/18/", "/products/?limit=100&page=1", "/products/?limit=100&page=2"]);
  });

  it("the fixtures find the Flush poster's Dreamship product", async () => {
    const ds = new DreamshipFixtures();
    expect(await ds.findProduct({ shopifyProductId: "8710000000" })).toBe(9972256);
    expect(await ds.findProduct({ variantIds: [45378126] })).toBe(9972256);
    expect(await ds.findProduct({ shopifyProductId: "1", variantIds: [1] })).toBeNull();
  });
});

describe("printers settings", () => {
  it("are in the printers group with the documented defaults", () => {
    expect(getDef("dreamship.sync_enabled")).toMatchObject({ section: "printers", default: false });
    expect(getDef("dreamship.import_wait_hours").default).toBe(6);
    expect(getDef("dreamship.sale_pct").default).toBe(60);
    expect(getDef("dreamship.min_margin_pct").default).toBe(30);
    expect(getDef("dreamship.api_url").default).toBe("https://api.dreamship.com/v1");
  });
  it("validate", () => {
    expect(validateSetting("dreamship.import_wait_hours", 0).ok).toBe(false);
    expect(validateSetting("dreamship.sale_pct", 60).ok).toBe(true);
    expect(validateSetting("dreamship.api_url", "http://insecure.example").ok).toBe(false);
    expect(validateSetting("dreamship.api_url", "https://api.dreamship.com/v1").ok).toBe(true);
  });
});
