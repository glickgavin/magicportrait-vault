import { describe, expect, it } from "vitest";
import { areaKeyForSize, coverDpi, looksLikeDreamship, parseDreamshipProductId, proposeSync } from "@/lib/dreamship/sync";
import { shopFixtures } from "@/lib/shop/sources";
import { DreamshipFixtures, parseProduct } from "@/lib/sources/dreamship";

async function flush() {
  const all = await shopFixtures().allProducts();
  return structuredClone(all.find((p) => p.handle === "fx-flush-poster")!);
}

async function report(over: { salePct?: number; minMarginPct?: number; picture?: { width: number; height: number } | null } = {}) {
  const ds = new DreamshipFixtures();
  const product = (await ds.product(9972256))!;
  const item = await ds.catalogItem(958);
  const shopify = await flush();
  return { shopify, r: proposeSync({ shopify, dreamship: product, item, salePct: over.salePct ?? 60, minMarginPct: over.minMarginPct ?? 30, picture: over.picture === undefined ? { width: 1024, height: 1024 } : over.picture }) };
}

describe("Dreamship sync: matching and proposals", () => {
  it("proposes from Dreamship's REST shapes (a product's product_variants, its item's w and h)", async () => {
    const shopify = await flush();
    shopify.variants = shopify.variants.slice(0, 1).map((v) => ({ ...v, title: "White / Small - 30x40in", sku: "45392982", metafields: [] }));
    const product = parseProduct({ id: 9986009, item: { id: 18 }, product_variants: [{ id: 45392982, item_variant: 746, size: "30x40in", cost: "18.50", price: "49.99" }], print_areas: [{ key: "30x40", url: "x" }] }, 9986009)!;
    const item = { id: 18, name: "Fleece Blanket", productionDaysMin: 1, productionDaysMax: 3, printAreas: [{ key: "30x40", widthPx: 5100, heightPx: 6600, dpi: 150, minDpi: null }] };
    const r = proposeSync({ shopify, dreamship: product, item, salePct: 50, minMarginPct: 30, picture: null });
    expect(r.sizes[0].proposed).toEqual({ maker: "dreamship", maker_sku: "746", print_px: "5100x6600", extra: JSON.stringify({ item_id: 18, print_area: "30x40", product_variant_id: 45392982 }), lead_days: "1-3" });
    expect(r.sizes[0].changes).toHaveLength(5);
  });

  it("matches every Shopify size to its Dreamship variant by SKU", async () => {
    const { r } = await report();
    expect(r.sizes.map((s) => [s.title, s.dreamshipVariantId, s.printArea])).toEqual([
      ['8x10"', 45378125, "8x10"],
      ['12x16"', 45378127, "12x16"],
      ['16x24"', 45378126, "16x24"],
      ['24x36"', 45378124, "24x36"],
    ]);
    expect(r.unmatched).toEqual([]);
  });

  it("proposes maker, item variant, print area pixels, extra and making time; the diff has only what differs", async () => {
    const { r } = await report();
    const s24 = r.sizes[3];
    expect(s24.proposed).toEqual({ maker: "dreamship", maker_sku: "17428", print_px: "6600x10200", extra: JSON.stringify({ item_id: 958, print_area: "24x36", product_variant_id: 45378124 }), lead_days: "1-3" });
    // 8x10 already has maker, maker_sku, print_px and lead_days: only extra differs.
    expect(r.sizes[0].changes.map((c) => c.key)).toEqual(["extra"]);
    // 12x16 has a wrong print_px (3000x4000), and no extra or lead_days.
    expect(r.sizes[1].changes).toEqual([
      { key: "print_px", from: "3000x4000", to: "3000x4200" },
      { key: "extra", from: null, to: JSON.stringify({ item_id: 958, print_area: "12x16", product_variant_id: 45378127 }) },
      { key: "lead_days", from: null, to: "1-3" },
    ]);
    expect(r.sizes[3].changes).toHaveLength(5);
    expect(r.fieldsChanged).toBe(1 + 3 + 5 + 5);
  });

  it("an extra with the same values in another order isn't a change", async () => {
    const ds = new DreamshipFixtures();
    const shopify = await flush();
    shopify.variants[0].metafields.push({ key: "extra", value: '{"product_variant_id":45378125,"print_area":"8x10","item_id":958}', type: "json", updatedAt: null });
    const r = proposeSync({ shopify, dreamship: (await ds.product(9972256))!, item: await ds.catalogItem(958), salePct: 60, minMarginPct: 30, picture: null });
    expect(r.sizes[0].changes).toEqual([]);
  });

  it("flags sizes with no Dreamship variant and Dreamship variants with no size", async () => {
    const ds = new DreamshipFixtures();
    const shopify = await flush();
    shopify.variants[3].sku = "FX-OTHER";
    const r = proposeSync({ shopify, dreamship: (await ds.product(9972256))!, item: await ds.catalogItem(958), salePct: 60, minMarginPct: 30, picture: null });
    expect(r.sizes[3].dreamshipVariantId).toBeNull();
    expect(r.unmatched).toEqual([{ productVariantId: 45378124, size: '24x36"' }]);
    expect(r.flags.map((f) => f.kind)).toEqual(expect.arrayContaining(["size_without_dreamship", "dreamship_without_size"]));
  });
});

describe("Dreamship sync: money and print quality", () => {
  it("margins at full price and at the sale, and the flags", async () => {
    const { r } = await report();
    const [s8, s12, , s24] = r.sizes;
    expect([s8.cost, s8.price, s8.marginPct, s8.saleProfit]).toEqual([22.99, 59.99, 61.7, 1.01]);
    expect(s12.saleProfit).toBe(-4.19);
    expect(s24.marginPct).toBe(-4.4);
    const kinds = r.flags.map((f) => `${f.kind}:${f.size}`);
    expect(kinds).toContain('cost_at_or_above_price:24x36"');
    expect(kinds).toContain('loss_at_sale:12x16"');
    expect(kinds).not.toContain('loss_at_sale:8x10"');
  });

  it("dpi: Royal Flush's 1024 squares are about 102 dpi on 8x10 and 28 on 24x36, below Dreamship's 250", async () => {
    const { r } = await report();
    expect(r.sizes.map((s) => s.dpi)).toEqual([102, 64, 43, 28]);
    // The 2:3 2K theme (docs/dreamship.md › Print quality): about 212 dpi on 8x10.
    expect(coverDpi({ width: 1696, height: 2528 }, { key: "8x10", widthPx: 1800, heightPx: 2400 })).toBe(212);
    expect(r.flags.filter((f) => f.kind === "below_min_dpi")).toHaveLength(4);
    const none = await report({ picture: null });
    expect(none.r.sizes[0].dpi).toBeNull();
  });

  it("the template's photo missing from the product's media is flagged", async () => {
    const ds = new DreamshipFixtures();
    const shopify = await flush();
    shopify.media = [{ id: "m1", url: "https://cdn.shopify.com/s/files/other.jpg", alt: null, width: 100, height: 100 }];
    const r = proposeSync({ shopify, dreamship: (await ds.product(9972256))!, item: await ds.catalogItem(958), salePct: 60, minMarginPct: 30, picture: null });
    expect(r.flags.map((f) => f.kind)).toContain("template_photo_missing");
  });
});

describe("Dreamship link input", () => {
  it("takes an id or the designer link", () => {
    expect(parseDreamshipProductId("9972256")).toBe(9972256);
    expect(parseDreamshipProductId(" https://app.dreamship.com/app/products/9972256?tab=design ")).toBe(9972256);
    expect(parseDreamshipProductId("not an id")).toBeNull();
    expect(areaKeyForSize('16x24"')).toBe("16x24");
    expect(areaKeyForSize("24 × 36 in")).toBe("24x36");
  });
  it("suggests a link when every SKU looks like a Dreamship variant id", async () => {
    expect(looksLikeDreamship(await flush())).toBe("45378125");
    const pillow = (await shopFixtures().allProducts()).find((p) => p.handle === "fx-pillow")!;
    expect(looksLikeDreamship(pillow)).toBeNull();
    expect(await new DreamshipFixtures().productForVariant(45378125)).toBe(9972256);
  });
});
