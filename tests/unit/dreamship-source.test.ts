import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDef, validateSetting } from "@/lib/settings/registry";
import { DreamshipError, DreamshipFixtures, DreamshipLive, PATHS, parseAccount, parseOrder, parseProduct } from "@/lib/sources/dreamship";

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
    expect(writes.sort()).toEqual(["PATCH", "POST"]);
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
  it("a refusal is a DreamshipError with a code", () => {
    expect(new DreamshipError("x", "not_editable", 400)).toMatchObject({ code: "not_editable", status: 400 });
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
