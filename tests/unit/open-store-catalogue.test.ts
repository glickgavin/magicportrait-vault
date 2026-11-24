import { beforeEach, describe, expect, it } from "vitest";
import { canSeeOpenStore } from "@/lib/open-store/access";
import { evaluateStoreProduct, gridProducts } from "@/lib/open-store/catalog";
import { getStoreCatalog, forgetStoreCatalog } from "@/lib/open-store";
import { productRows, refreshThemes, updateStoreFields } from "@/lib/open-store/admin";
import { mapProduct, parseRating } from "@/lib/open-store/sources/live";
import { OpenStoreFixtures } from "@/lib/open-store/sources/fixtures";
import { getSetting, setSetting } from "@/lib/settings";
import { getProductSetting, getVariantSetting } from "@/lib/settings/product";
import { productFieldProblems, readProductField } from "@/lib/settings/product-fields";
import { LAUNCH_SWITCHES, PRODUCT_FIELDS, REGISTRY } from "@/lib/settings/registry";
import { adminProducts } from "@/lib/shop";
import { updateVariantRules, rulesFor } from "@/lib/shop/admin";
import { shopFixtures } from "@/lib/shop/sources";
import { FX_PUBLICATION_ID } from "@/lib/shop/sources/fixtures";
import { FX_IMAGEN_THEMES, parseThemes } from "@/lib/sources/imagen-api";

const actor = { email: "test@example.com" };
const entry = async (handle: string) => (await getStoreCatalog({ fresh: true })).entries.find((e) => e.product.handle === handle)!;

beforeEach(() => {
  shopFixtures().reset();
  forgetStoreCatalog();
});

describe("who sees the Magic Store", () => {
  it("is hidden unless open_store.enabled, or the super-user preview for super users", () => {
    expect(canSeeOpenStore({ enabled: false, superUserPreview: false }, { isSuperUser: true })).toBe(false);
    expect(canSeeOpenStore({ enabled: false, superUserPreview: true }, { isSuperUser: true })).toBe(true);
    expect(canSeeOpenStore({ enabled: false, superUserPreview: true }, { isSuperUser: false })).toBe(false);
    expect(canSeeOpenStore({ enabled: false, superUserPreview: true }, null)).toBe(false);
    expect(canSeeOpenStore({ enabled: true, superUserPreview: false }, null)).toBe(true);
  });
  it("both switches are launch switches and default off", () => {
    expect(LAUNCH_SWITCHES).toEqual(expect.arrayContaining(["open_store.enabled", "open_store.super_user_preview"]));
    expect(REGISTRY["open_store.enabled"].default).toBe(false);
    expect(REGISTRY["open_store.super_user_preview"].default).toBe(false);
  });
});

describe("the open-store check", () => {
  it("shows a product only when it's active, has rules on every size, a template and a theme", async () => {
    const { collection, entries } = await getStoreCatalog({ fresh: true });
    expect(collection?.handle).toBe("magic-store");
    const by = Object.fromEntries(entries.map((e) => [e.product.handle, e]));
    expect(by["fx-pillow"].hidden).toEqual([]);
    expect(by["fx-canvas"].hidden).toEqual([]); // only in the Magic Store
    expect(by["fx-poster"].hidden).toEqual(["no_rules"]); // one size has no rules
    expect(by["fx-tile"].hidden).toEqual(expect.arrayContaining(["no_rules", "no_template", "no_theme"]));
    expect(by["fx-ornaments"]).toMatchObject({ hidden: [], relatedOnly: true, theme: null });
    // A bad value set by hand is flagged, not hiding.
    expect(by["fx-mug"].hidden).toEqual([]);
    expect(by["fx-mug"].warnings.join(" ")).toMatch(/Results to show.*store default/);
    // The grid leaves out hidden and related-only products, in the collection's order.
    expect(gridProducts(entries).map((e) => e.product.handle)).toEqual(["fx-pillow", "fx-mug", "fx-canvas", "fx-puzzle", "fx-acrylic-block"]);
  });

  it("checks the theme against Imagen's list and the sales channel when set", async () => {
    const pillow = (await entry("fx-pillow")).product;
    const retired = { ...pillow, store: { ...pillow.store!, imagenTheme: "retired-01" } };
    expect(evaluateStoreProduct(retired, { themes: FX_IMAGEN_THEMES }).hidden).toEqual(["theme_unavailable"]);
    expect(evaluateStoreProduct({ ...pillow, store: { ...pillow.store!, imagenTheme: "nope-99" } }, { themes: FX_IMAGEN_THEMES }).hidden).toEqual(["theme_unavailable"]);
    expect(evaluateStoreProduct(retired, { themes: null }).hidden).toEqual([]); // list unreadable: not checked
    expect(evaluateStoreProduct(pillow, { publicationId: FX_PUBLICATION_ID }).hidden).toEqual([]);
    expect(evaluateStoreProduct(pillow, { publicationId: "gid://shopify/Publication/1" }).hidden).toEqual(["not_published"]);
    expect(evaluateStoreProduct({ ...pillow, status: "DRAFT" }).hidden).toContain("not_active");
  });
});

describe("product fields use the settings framework", () => {
  it("every field falls back to a registered store setting or its own default", () => {
    for (const [key, d] of Object.entries(PRODUCT_FIELDS)) {
      const def = d as { fallback?: string; default?: unknown };
      if (def.fallback) expect(Object.keys(REGISTRY), key).toContain(def.fallback);
      else expect(def.default, key).not.toBeUndefined();
    }
  });

  it("getProductSetting: the product's value, else the store's; a bad value uses the store's", async () => {
    const pillow = (await entry("fx-pillow")).product;
    const mug = (await entry("fx-mug")).product;
    expect(await getProductSetting(pillow, "name_max")).toBe(14);
    expect(await getProductSetting(pillow, "imagen_theme")).toBe("admiral-01");
    expect((await getProductSetting(pillow, "step_labels"))[1]).toBe("Painting {name} as The Admiral");
    expect(await getProductSetting(mug, "images_to_show")).toBe(4); // "lots" in Shopify → the store default
    expect(readProductField(mug, "images_to_show").state).toBe("invalid");
    expect(productFieldProblems(mug).map((p) => p.key)).toEqual(["images_to_show"]);
    expect(await getProductSetting(mug, "photo_tips")).toBe(await getSetting("open_store.photo_tips"));
    await setSetting("open_store.images_to_show", 2, "test@example.com");
    expect(await getProductSetting(mug, "images_to_show")).toBe(2);
    await setSetting("open_store.images_to_show", 4, "test@example.com");
    expect(await getVariantSetting(mug.variants[0], "lead_days")).toBe("3-5");
    expect(await getVariantSetting(mug.variants[0], "badge")).toBe("Bestseller");
    expect(await getVariantSetting(pillow.variants[0], "badge")).toBe("");
  });
});

describe("Settings › Shop as one area", () => {
  it("lists every product in either collection once", async () => {
    const r = await productRows();
    if (!r.ok) throw new Error(r.error);
    const handles = r.rows.map((x) => x.product.handle);
    expect(new Set(handles).size).toBe(handles.length);
    expect(r.rows.find((x) => x.product.handle === "fx-canvas")).toMatchObject({ shop: null, store: expect.anything() });
    expect(r.rows.find((x) => x.product.handle === "fx-tee")).toMatchObject({ shop: expect.anything(), store: null });
    expect(r.rows.find((x) => x.product.handle === "fx-pillow")).toMatchObject({ shop: expect.anything(), store: expect.anything() });
    // The product carries its Magic Store fields when it's in the Magic Store.
    expect(r.rows.find((x) => x.product.handle === "fx-pillow")!.product.store?.imagenTheme).toBe("admiral-01");
  });

  it("saves only changed Magic Store fields, merging the picture settings", async () => {
    const pillow = (await entry("fx-pillow")).product;
    const fx = shopFixtures();
    fx.writes.length = 0;
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { imagen_theme: "admiral-01", generation: { photo_tips: "Face the camera." } }, variants: [] })).toEqual({ ok: true });
    expect(fx.writes).toHaveLength(1);
    const w = fx.writes[0].payload as { set: { key: string; value: string }[]; clear: string[] };
    expect(w.set.map((x) => x.key)).toEqual(["generation"]); // the theme didn't change
    const gen = JSON.parse(w.set[0].value) as Record<string, unknown>;
    expect(gen).toMatchObject({ photo_tips: "Face the camera.", name_max: 14, subject: "pet" }); // other keys kept
    expect(await getProductSetting((await entry("fx-pillow")).product, "photo_tips")).toBe("Face the camera.");
    // Clearing one key brings the store default back; nothing to do writes nothing.
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { generation: { photo_tips: null } }, variants: [] })).toEqual({ ok: true });
    expect(await getProductSetting((await entry("fx-pillow")).product, "photo_tips")).toBe(await getSetting("open_store.photo_tips"));
    fx.writes.length = 0;
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { imagen_theme: "admiral-01" }, variants: [] })).toEqual({ ok: true });
    expect(fx.writes).toHaveLength(0);
  });

  it("sets a theme, more gifts, related only and a size's badge and making time", async () => {
    const canvas = (await entry("fx-canvas")).product;
    const mug = (await entry("fx-mug")).product;
    const r = await updateStoreFields(actor, {
      productId: canvas.id,
      fields: { imagen_theme: "plumber-01", related: [mug.id], open_store_related: true, details: "Cotton canvas." },
      variants: [{ variantId: canvas.variants[0].id, badge: "New", lead_days: "5-7" }],
    });
    expect(r).toEqual({ ok: true });
    const after = await entry("fx-canvas");
    expect(after).toMatchObject({ theme: "plumber-01", relatedOnly: true });
    expect(after.product.store).toMatchObject({ related: [mug.id], details: "Cotton canvas." });
    expect(await getVariantSetting(after.product.variants[0], "lead_days")).toBe("5-7");
    expect(await getVariantSetting(after.product.variants[0], "badge")).toBe("New");
  });

  it("refuses what isn't allowed", async () => {
    const pillow = (await entry("fx-pillow")).product;
    const rows = await productRows();
    if (!rows.ok) throw new Error(rows.error);
    const tee = rows.rows.find((x) => x.product.handle === "fx-tee")!.product;
    // Magic Store fields on a product that isn't in the Magic Store collection.
    expect(await updateStoreFields(actor, { productId: tee.id, fields: { imagen_theme: "admiral-01" }, variants: [] })).toMatchObject({ ok: false, status: 400 });
    // But its shared short description is fine.
    expect(await updateStoreFields(actor, { productId: tee.id, fields: { short_description: "Soft cotton." }, variants: [] })).toEqual({ ok: true });
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { imagen_theme: "nope-99" }, variants: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { imagen_theme: "retired-01" }, variants: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { related: [tee.id] }, variants: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await updateStoreFields(actor, { productId: pillow.id, fields: { related: [pillow.id] }, variants: [] })).toMatchObject({ ok: false, status: 400 });
    expect(await updateStoreFields(actor, { productId: "gid://shopify/Product/1", fields: {}, variants: [] })).toMatchObject({ ok: false, status: 404 });
  });

  it("Refresh themes from Imagen fills the Shopify dropdown with the active themes", async () => {
    const r = await refreshThemes(actor);
    expect(r).toMatchObject({ ok: true, removed: 0 });
    const choices = shopFixtures().imagenThemeChoices();
    expect(choices).toContain("duo-portrait-01");
    expect(choices).not.toContain("retired-01");
    // With the dropdown set, a theme outside it is refused by Shopify too.
    expect(await shopFixtures().setProductMetafields((await entry("fx-pillow")).product.id, "mmp_shop", { set: [{ key: "imagen_theme", type: "single_line_text_field", value: "retired-01" }], clear: [] })).toEqual({ ok: false, reason: "INCLUSION" });
  });

  it("print rules and templates work for a product only in the Magic Store", async () => {
    const all = await adminProducts();
    const canvas = all.find((p) => p.handle === "fx-canvas")!;
    expect(all.some((p) => p.handle === "fx-tee")).toBe(true);
    const r = await updateVariantRules(actor, { productId: canvas.id, variants: [{ variantId: canvas.variants[0].id, rules: { ...rulesFor(canvas.variants[0].metafields), min_short_side_px: "1500" } }] });
    expect(r).toEqual({ ok: true });
  });
});

describe("live reads", () => {
  it("parses Imagen's theme list in the shapes it may take", () => {
    expect(parseThemes({ themes: [{ slug: "bathroom-01", name: "Bath", is_active: true, required_images: 1 }, { id: "duo-01", title: "Duo", image_count: 2 }, { slug: "BAD SLUG" }] })).toEqual([
      { slug: "bathroom-01", name: "Bath", active: true, photos: 1, category: null },
      { slug: "duo-01", name: "Duo", active: true, photos: 2, category: null },
    ]);
    expect(parseThemes([{ slug: "x-1", active: false }])).toEqual([{ slug: "x-1", name: "x-1", active: false, photos: null, category: null }]);
    expect(parseThemes("nope")).toEqual([]);
  });
  it("reads the standard reviews rating", () => {
    expect(parseRating('{"value":"4.75","scale_min":"1.0","scale_max":"5.0"}')).toBe(4.8);
    expect(parseRating(null)).toBeNull();
    expect(parseRating("oops")).toBeNull();
  });
  it("maps a Magic Store product with its fields", () => {
    const p = mapProduct(
      {
        id: "gid://shopify/Product/1",
        legacyResourceId: "1",
        handle: "h",
        title: "T",
        description: "",
        descriptionHtml: null,
        productType: "",
        status: "ACTIVE",
        createdAt: "2026-11-01T00:00:00Z",
        seo: { title: null, description: null },
        media: { nodes: [] },
        page: null,
        occasions: null,
        categories: null,
        shortDescription: null,
        template: null,
        imagenTheme: { value: "bathroom-01" },
        generation: { value: '{"name_max":10}' },
        related: { value: '["gid://shopify/Product/2"]' },
        relatedOnly: { value: "false" },
        details: null,
        rating: { value: '{"value":"5"}' },
        ratingCount: { value: "12" },
        resourcePublicationsV2: { nodes: [{ publication: { id: "gid://shopify/Publication/9" } }] },
        variants: { nodes: [] },
      },
      3,
    );
    expect(p.position).toBe(3);
    expect(p.store).toMatchObject({ imagenTheme: "bathroom-01", related: ["gid://shopify/Product/2"], relatedOnly: "false", rating: 5, ratingCount: 12, publicationIds: ["gid://shopify/Publication/9"] });
  });
  it("the fixture menu links to collections with their images", async () => {
    const m = await new OpenStoreFixtures().menu("magic-store");
    expect(m?.items.map((i) => i.collectionHandle)).toEqual(["magic-store", "pet-gifts", "wall-art", "for-the-home"]);
    expect(m?.items[0].image?.url).toBeTruthy();
    expect(await new OpenStoreFixtures().menu("nope")).toBeNull();
  });
});
