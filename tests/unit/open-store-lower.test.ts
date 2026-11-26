import { describe, expect, it } from "vitest";
import { initialOf, scoreText, trustpilotColour, trustpilotStars, wallRows } from "@/lib/open-store/lower";
import { storeFieldsSchema } from "@/lib/open-store/admin";
import { getProductSetting } from "@/lib/settings/product";
import { productFieldProblems } from "@/lib/settings/product-fields";
import { getDef, qualitySchema, validateSetting } from "@/lib/settings/registry";
import { planCopy } from "@/lib/shop/copy-settings";
import type { ShopProduct } from "@/lib/shop/sources/types";

// The product page's trust card and lower sections (docs/open-store.md › Product page, items 9 and 12 to 18).

describe("Trustpilot stars", () => {
  it("round to the nearest half star, as Trustpilot shows them", () => {
    expect(trustpilotStars(4.1)).toEqual(["full", "full", "full", "full", "empty"]);
    expect(trustpilotStars(4.3)).toEqual(["full", "full", "full", "full", "half"]);
    expect(trustpilotStars(4.8)).toEqual(["full", "full", "full", "full", "full"]);
    expect(trustpilotStars(1.2)).toEqual(["full", "empty", "empty", "empty", "empty"]);
    expect(trustpilotStars(9)).toHaveLength(5);
  });
  it("use Trustpilot's colours and one decimal", () => {
    expect(trustpilotColour(4.1)).toBe("#00B67A");
    expect(trustpilotColour(3.2)).toBe("#73CF11");
    expect(trustpilotColour(1.1)).toBe("#FF3722");
    expect(scoreText(4)).toBe("4.0");
    expect(scoreText(4.1)).toBe("4.1");
  });
});

describe("customer photos and reviews", () => {
  it("split into two rows, an odd one in the first", () => {
    expect(wallRows(["a", "b", "c"])).toEqual([["a", "b"], ["c"]]);
    expect(wallRows([])).toEqual([[], []]);
  });
  it("a review's badge is the reviewer's initial", () => {
    expect(initialOf(" sarah M.")).toBe("S");
    expect(initialOf("")).toBe("?");
  });
});

describe("the lower page's settings", () => {
  it("defaults are valid, and the Trustpilot default is Trustpilot's own figures", () => {
    for (const k of ["open_store.trust_stats", "open_store.trustpilot", "open_store.how_steps", "open_store.wall_photos", "open_store.reviews", "open_store.guarantees", "open_store.faq"] as const) {
      expect(validateSetting(k, getDef(k).default).ok, k).toBe(true);
    }
    expect(getDef("open_store.trustpilot").default).toMatchObject({ score: 4.1, label: "Great", url: "https://www.trustpilot.com/review/www.storyboards.io" });
  });
  it("no reviews are made up: the default list is empty", () => {
    expect(getDef("open_store.reviews").default).toEqual([]);
  });
  it("refuses a score off Trustpilot's scale, a second decimal or a link that isn't https", () => {
    expect(validateSetting("open_store.trustpilot", { score: 5.5, label: "", count: null, url: "" }).ok).toBe(false);
    expect(validateSetting("open_store.trustpilot", { score: 4.15, label: "", count: null, url: "" }).ok).toBe(false);
    expect(validateSetting("open_store.trustpilot", { score: 4.1, label: "Great", count: 10, url: "http://x.com" }).ok).toBe(false);
    expect(validateSetting("open_store.trustpilot", { score: null, label: "", count: null, url: "" }).ok).toBe(true);
  });
  it("photos are https links or paths in the app", () => {
    expect(validateSetting("open_store.wall_photos", ["https://cdn.shopify.com/a.webp", "/store/b.webp"]).ok).toBe(true);
    expect(validateSetting("open_store.wall_photos", ["javascript:alert(1)"]).ok).toBe(false);
    expect(validateSetting("open_store.how_steps", [{ title: "Snap", body: "A photo.", image: "data:image/png;base64,xx" }]).ok).toBe(false);
  });
  it("the old How it works list is gone from the registry", () => {
    expect(validateSetting("open_store.how_it_works", ["a"]).ok).toBe(true); // an unregistered key: any small JSON
    expect(() => getDef("open_store.how_it_works" as never)).not.toThrow();
    expect(getDef("open_store.how_it_works" as never)).toBeUndefined();
  });
});

describe("Real product, real quality (a product's own fields)", () => {
  const quality = { photo: "https://cdn.shopify.com/s/files/tile.jpg", alt: "A tile on a wall", features: [{ icon: "sticker", title: "Stick anywhere", sub: "Any wall, no nails" }] };
  // A made-up product, read without the database (the field has no store setting to fall back to).
  async function pillow(id = 1): Promise<ShopProduct> {
    return {
      id: `gid://shopify/Product/${id}`,
      legacyId: String(id),
      handle: `p${id}`,
      title: `Product ${id}`,
      description: "",
      productType: "",
      status: "ACTIVE",
      position: 0,
      media: [],
      page: null,
      occasions: [],
      categories: [],
      template: null,
      variants: [],
      store: { imagenTheme: "admiral", generation: null, related: [], relatedOnly: null, details: null, createdAt: "2026-11-01T00:00:00Z", seoTitle: null, seoDescription: null, rating: null, ratingCount: null, publicationIds: [] },
    };
  }
  const withGeneration = (p: ShopProduct, g: Record<string, unknown>): ShopProduct => ({ ...p, store: { ...p.store!, generation: JSON.stringify(g) } });

  it("needs a photo and one to four features", () => {
    expect(qualitySchema.safeParse(quality).success).toBe(true);
    expect(qualitySchema.safeParse({ ...quality, features: [] }).success).toBe(false);
    expect(qualitySchema.safeParse({ ...quality, features: Array(5).fill(quality.features[0]) }).success).toBe(false);
    expect(qualitySchema.safeParse({ ...quality, photo: "" }).success).toBe(false);
    // An icon left out is a tick.
    expect(qualitySchema.parse({ photo: quality.photo, features: [{ title: "Made in USA" }] })).toMatchObject({ alt: "", features: [{ icon: "check", sub: "" }] });
  });

  it("is read from the product's picture settings; none means the section is left out", async () => {
    const p = await pillow();
    expect(await getProductSetting(p, "quality")).toBeNull();
    expect(await getProductSetting(withGeneration(p, { quality }), "quality")).toMatchObject(quality);
    // A bad value is flagged in Settings and ignored on the page.
    const bad = withGeneration(p, { quality: { photo: "nope", features: [] } });
    expect(await getProductSetting(bad, "quality")).toBeNull();
    expect(productFieldProblems(bad).map((x) => x.key)).toContain("quality");
  });

  it("Settings saves it, and Copy settings carries it", async () => {
    const id = "gid://shopify/Product/123";
    expect(storeFieldsSchema.safeParse({ productId: id, fields: { generation: { quality } } }).success).toBe(true);
    expect(storeFieldsSchema.safeParse({ productId: id, fields: { generation: { quality: null } } }).success).toBe(true);
    expect(storeFieldsSchema.safeParse({ productId: id, fields: { generation: { quality: { photo: "x", features: [] } } } }).success).toBe(false);
    const from = withGeneration(await pillow(), { quality });
    const to = await pillow(2);
    expect(planCopy(from, to, ["magic_store"]).fields?.generation).toMatchObject({ quality });
  });
});
