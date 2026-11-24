import { describe, expect, it } from "vitest";
import { planCopy, sizeKey } from "@/lib/shop/copy-settings";
import type { ShopProduct, ShopVariant } from "@/lib/shop/sources/types";

// "Copy settings from…" (docs/shop.md › Copy settings): what gets copied, and what never does. Made-up products only.

const mf = (o: Record<string, string>) => Object.entries(o).map(([key, value]) => ({ key, value, type: "single_line_text_field", updatedAt: null }));
const variant = (id: number, title: string, fields: Record<string, string>): ShopVariant => ({ id: `gid://shopify/ProductVariant/${id}`, legacyId: String(id), title, sku: String(id), price: "10.00", compareAtPrice: null, availableForSale: true, options: [], metafields: mf(fields) });
const template = (bg: string, overlay: string | null) =>
  JSON.stringify({ v: 1, background: { media_id: bg, url: `https://cdn.example/${bg}.jpg`, w: 1000, h: 1000 }, zone: { kind: "corners", points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]] }, overlay: overlay ? { media_id: overlay, url: `https://cdn.example/${overlay}.png`, w: 1000, h: 1000 } : null, mask: { kind: "rounded", radius: 0.1 }, blend: "multiply" });

function product(id: number, over: Partial<ShopProduct>): ShopProduct {
  return {
    id: `gid://shopify/Product/${id}`,
    legacyId: String(id),
    handle: `p${id}`,
    title: `Product ${id}`,
    description: "",
    productType: "",
    status: "ACTIVE",
    position: 0,
    media: [{ id: `media-${id}`, url: `https://cdn.example/media-${id}.jpg`, alt: null, width: 1200, height: 900 }],
    page: null,
    occasions: [],
    categories: [],
    template: null,
    variants: [],
    store: { imagenTheme: `theme-${id}`, generation: null, related: [], relatedOnly: null, details: null, createdAt: "2026-11-01T00:00:00Z", seoTitle: null, seoDescription: null, rating: null, ratingCount: null, publicationIds: [] },
    ...over,
  };
}

const from = product(1, {
  title: "Flush poster",
  template: { value: template("media-1", "frame-file"), updatedAt: null },
  shortDescription: "Ready to hang",
  page: "Gifts",
  occasions: ["Birthday"],
  categories: ["Wall art"],
  variants: [variant(11, '8x10"', { maker: "dreamship", maker_sku: "17383", print_px: "1800x2400", badge: "Bestseller", lead_days: "1-3" }), variant(12, '12x16"', { maker: "dreamship", lead_days: "2-4" })],
  store: { ...product(1, {}).store!, imagenTheme: "royal-flush", generation: JSON.stringify({ name_max: 12, subject: "pet" }), related: ["gid://shopify/Product/2", "gid://shopify/Product/3"], details: "Acrylic", relatedOnly: null },
});
const to = product(2, { title: "Aces poster", variants: [variant(21, "8 × 10 in", { maker: "dreamship", maker_sku: "99999" }), variant(22, "24 × 36 in", {})] });

describe("copy settings", () => {
  it("matches sizes by their numbers, whatever the spelling", () => {
    expect(sizeKey('12x16"')).toBe(sizeKey("12 × 16 in"));
    expect(sizeKey("8 x 10 inches")).toBe("8x10");
  });

  it("copies the template onto this product's own first photo, keeping zone, mask, blend and a Files overlay", () => {
    const p = planCopy(from, to, ["template"]);
    expect(p.template?.background).toEqual({ media_id: "media-2", url: "https://cdn.example/media-2.jpg", w: 1200, h: 900 });
    expect(p.template?.zone).toEqual(JSON.parse(from.template!.value).zone);
    expect(p.template?.mask).toEqual({ kind: "rounded", radius: 0.1 });
    expect(p.template?.blend).toBe("multiply");
    expect(p.template?.overlay?.media_id).toBe("frame-file");
  });

  it("drops an overlay that is the other product's own gallery photo", () => {
    const withOwn = { ...from, media: [...from.media, { id: "own-overlay", url: "x", alt: null, width: 1, height: 1 }], template: { value: template("media-1", "own-overlay"), updatedAt: null } };
    const p = planCopy(withOwn, to, ["template"]);
    expect(p.template?.overlay).toBeNull();
    expect(p.skipped.join(" ")).toMatch(/overlay/);
  });

  it("copies the Magic Store fields but never the theme, and never lists this product as its own 'more gifts'", () => {
    const p = planCopy(from, to, ["magic_store"]);
    expect(p.fields).toMatchObject({ short_description: "Ready to hang", details: "Acrylic", related: ["gid://shopify/Product/3"], generation: { name_max: 12, subject: "pet", photos: null } });
    expect(JSON.stringify(p)).not.toContain("royal-flush");
  });

  it("copies badges and lead times by size name; never maker, SKU or print size", () => {
    const p = planCopy(from, to, ["sizes"]);
    expect(p.variants).toEqual([{ variantId: "gid://shopify/ProductVariant/21", badge: "Bestseller", lead_days: "1-3" }]);
    expect(p.skipped).toEqual(["No size called “24 × 36 in” on Flush poster."]);
    expect(JSON.stringify(p)).not.toMatch(/maker|print_px|17383/);
  });

  it("copies only the parts asked for", () => {
    const p = planCopy(from, to, ["pages"]);
    expect(p).toMatchObject({ template: null, fields: null, variants: [], pages: { page: "Gifts", occasions: ["Birthday"], categories: ["Wall art"] } });
  });

  it("says why when there's nothing to copy", () => {
    const p = planCopy(product(4, { store: undefined }), product(5, { media: [] }), ["template", "magic_store"]);
    expect(p.template).toBeNull();
    expect(p.skipped).toHaveLength(2);
  });
});
