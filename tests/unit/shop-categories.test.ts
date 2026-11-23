import { describe, expect, it } from "vitest";
import { getCatalog } from "@/lib/shop";
import { categoriesInUse, shopOverview, updateList, updateProductFields } from "@/lib/shop/admin";
import { categoriesOf } from "@/lib/shop/pages";
import { shopFixtures } from "@/lib/shop/sources";

const actor = { email: "test@example.com" };
const entry = async (handle: string) => (await getCatalog({ fresh: true })).find((e) => e.product.handle === handle)!;

describe("Products page categories work like Gifts occasions", () => {
  it("a product's categories, else its Shopify product type", async () => {
    const poster = await entry("fx-poster");
    expect(categoriesOf(poster)).toEqual(["Wall art"]);
    expect(categoriesOf({ ...poster, product: { ...poster.product, categories: [], productType: "Prints" } })).toEqual(["Prints"]);
    expect(categoriesOf({ ...poster, product: { ...poster.product, categories: [], productType: " " } })).toEqual([]);
    expect(categoriesInUse([{ ...poster, product: { ...poster.product, categories: [], productType: "Prints" } }])).toEqual(["Prints"]);
  });

  it("Settings lists them in order, and a product's categories save to mmp_shop.categories", async () => {
    const o = await shopOverview();
    if (!o.ok) throw new Error(o.error);
    expect(o.categoriesFromDefinition).toBe(true);
    expect(o.categories.slice(0, 2)).toEqual(["Mugs", "Puzzles"]);
    const poster = await entry("fx-poster");
    const fx = shopFixtures();
    fx.writes.length = 0;
    expect(await updateProductFields(actor, { productId: poster.product.id, categories: ["Wall art", "Acrylic"] })).toEqual({ ok: true });
    expect(fx.writes).toEqual([{ type: "metafieldsSet", target: poster.product.id, payload: { namespace: "mmp_shop", categories: ["Wall art", "Acrylic"] } }]);
    expect((await entry("fx-poster")).product.categories).toEqual(["Wall art", "Acrylic"]);
    // Only names in the list.
    expect(await updateProductFields(actor, { productId: poster.product.id, categories: ["Nope"] })).toMatchObject({ ok: false, status: 400 });
    // Put it back.
    expect(await updateProductFields(actor, { productId: poster.product.id, categories: ["Wall art"] })).toEqual({ ok: true });
  });

  it("the list can be reordered and grown, but a category still on a product can't be removed", async () => {
    const o = await shopOverview();
    if (!o.ok) throw new Error(o.error);
    const before = o.categories;
    const next = ["Wall art", ...before.filter((c) => c !== "Wall art"), "Home decor"];
    expect(await updateList(actor, "categories", next)).toEqual({ ok: true });
    const after = await shopOverview();
    expect(after.ok && after.categories).toEqual(next);
    const r = await updateList(actor, "categories", next.filter((c) => c !== "Mugs"));
    expect(r).toMatchObject({ ok: false, status: 409, inUse: ["Mugs"] });
    expect(await updateList(actor, "categories", before)).toEqual({ ok: true });
  });
});

describe("a Settings › Shop save reaches every server at once", () => {
  it("stamps shop.catalog_changed_at, and a cached product list older than it is read again", async () => {
    const { getSetting } = await import("@/lib/settings");
    const before = Date.now();
    const poster = await entry("fx-poster");
    expect(await updateProductFields(actor, { productId: poster.product.id, categories: ["Wall art", "Acrylic"] })).toEqual({ ok: true });
    expect(await getSetting("shop.catalog_changed_at")).toBeGreaterThanOrEqual(before);
    // Another server's copy (simulated: an old cached list) is ignored once the stamp is newer.
    const g = globalThis as unknown as { __shopCatalog?: { at: number; entries: unknown[] } | null };
    g.__shopCatalog = { at: before - 1, entries: [] };
    expect((await getCatalog()).length).toBeGreaterThan(0);
    expect(await updateProductFields(actor, { productId: poster.product.id, categories: ["Wall art"] })).toEqual({ ok: true });
  });
});
