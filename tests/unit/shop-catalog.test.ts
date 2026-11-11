import { beforeEach, describe, expect, it } from "vitest";
import { canSeeShop } from "@/lib/shop/access";
import { evaluateCatalog, evaluateProduct, forPage } from "@/lib/shop/catalog";
import { fieldSpecs, normalisePage, parseList } from "@/lib/shop/fields";
import { parsePx, parseVariantRules } from "@/lib/shop/rules";
import { FX_COLLECTION_ID, FX_VIP_EMAIL, ShopCatalogFixtures } from "@/lib/shop/sources/fixtures";
import type { RawMetafield } from "@/lib/shop/sources/types";
import { LAUNCH_SWITCHES, REGISTRY } from "@/lib/settings/registry";

const mf = (o: Record<string, string>, updatedAt = "2026-11-01T00:00:00Z"): RawMetafield[] => Object.entries(o).map(([key, value]) => ({ key, value, type: "single_line_text_field", updatedAt }));

describe("who sees the shop", () => {
  const su = { isSuperUser: true };
  const customer = { isSuperUser: false };
  it("nobody while both switches are off", () => {
    for (const u of [null, customer, su]) expect(canSeeShop({ enabled: false, superUserPreview: false }, u)).toBe(false);
  });
  it("only super users with the preview switch", () => {
    expect(canSeeShop({ enabled: false, superUserPreview: true }, su)).toBe(true);
    expect(canSeeShop({ enabled: false, superUserPreview: true }, customer)).toBe(false);
    expect(canSeeShop({ enabled: false, superUserPreview: true }, null)).toBe(false);
  });
  it("everyone once it's on", () => {
    expect(canSeeShop({ enabled: true, superUserPreview: false }, customer)).toBe(true);
  });
  it("both switches are launch switches and default off", () => {
    expect(LAUNCH_SWITCHES).toContain("shop.enabled");
    expect(LAUNCH_SWITCHES).toContain("shop.super_user_preview");
    expect(REGISTRY["shop.enabled"].default).toBe(false);
    expect(REGISTRY["shop.super_user_preview"].default).toBe(false);
  });
  it("the writable namespace is fixed", () => {
    expect(REGISTRY["shop.metafield_namespace"].default).toBe("mmp_shop");
    expect(REGISTRY["shop.metafield_namespace"].readOnly).toBe(true);
  });
});

describe("variant rules", () => {
  it("needs a maker, the maker's code and a print area", () => {
    const r = parseVariantRules([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["maker", "maker_sku", "print_px"]);
  });
  it("fills the optional rules with defaults", () => {
    const r = parseVariantRules(mf({ maker: "Gelato", maker_sku: "abc", print_px: "2400x3000" }), { minShortSidePx: 900, maxCropPct: 25 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rules).toMatchObject({ maker: "gelato", makerSku: "abc", printPx: { w: 2400, h: 3000 }, placement: "cover", minShortSidePx: 900, maxCropPct: 25, adjustable: true, imageKinds: "both", background: null, extra: {} });
  });
  it("reports bad values instead of guessing", () => {
    const r = parseVariantRules(mf({ maker: "acme", maker_sku: "x", print_px: "big", placement: "stretch", max_crop_pct: "200", adjustable: "maybe", background: "pink", extra: "[1]" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid.sort()).toEqual(["adjustable", "background", "extra", "maker", "max_crop_pct", "placement", "print_px"].sort());
  });
  it("keeps the newest rule change as the version", () => {
    const fields = [...mf({ maker: "prodigi", maker_sku: "S" }, "2026-10-01T00:00:00Z"), ...mf({ print_px: "100x200" }, "2026-11-05T00:00:00Z")];
    const r = parseVariantRules(fields);
    expect(r.ok && r.rules.version).toBe("2026-11-05T00:00:00Z");
  });
  it("reads print sizes like 2400x3000 and 2400 × 3000", () => {
    expect(parsePx("2400x3000")).toEqual({ w: 2400, h: 3000 });
    expect(parsePx(" 2400 × 3000 ")).toEqual({ w: 2400, h: 3000 });
    expect(parsePx("2400")).toBeNull();
  });
});

describe("the Store collection", () => {
  const fx = new ShopCatalogFixtures();
  beforeEach(() => fx.reset());

  it("shows ready products and says why the others are hidden", async () => {
    const entries = evaluateCatalog(await fx.storeProducts(FX_COLLECTION_ID));
    const by = Object.fromEntries(entries.map((e) => [e.product.handle, e]));
    expect(by["fx-ornaments"].hidden).toEqual([]);
    expect(by["fx-tile"].hidden).toEqual(["no_rules", "no_template"]);
    expect(by["fx-tee"].hidden).toEqual(["not_active", "no_page", "sold_out", "no_template"]);
    expect(by["fx-tile"].warnings).toContain("No product type, so the Products page can't group it");
  });
  it("drops a size with no rules but keeps the product", async () => {
    const poster = evaluateProduct((await fx.storeProducts(FX_COLLECTION_ID)).find((p) => p.handle === "fx-poster")!);
    expect(poster.hidden).toEqual([]);
    expect(poster.sellable.map((s) => s.variant.title)).toEqual(["8 × 10 in", "12 × 16 in", "18 × 24 in"]);
    expect(poster.warnings[0]).toMatch(/^24 × 36 in: missing maker, maker_sku, print_px/);
  });
  it("puts All products on both pages, in the collection's order", async () => {
    const entries = evaluateCatalog(await fx.storeProducts(FX_COLLECTION_ID));
    expect(forPage(entries, "gifts").map((e) => e.product.handle)).toEqual(["fx-ornaments", "fx-mug", "fx-pillow", "fx-puzzle", "fx-acrylic-block"]);
    expect(forPage(entries, "products").map((e) => e.product.handle)).toEqual(["fx-mug", "fx-puzzle", "fx-acrylic-block", "fx-poster"]);
  });
  it("only another collection id gives nothing", async () => {
    expect(await fx.storeProducts("123456789")).toEqual([]);
  });
});

describe("writes stay inside mmp_shop", () => {
  const fx = new ShopCatalogFixtures();
  beforeEach(() => fx.reset());

  it("sets page and occasions and records exactly that", async () => {
    const [p] = await fx.storeProducts(FX_COLLECTION_ID);
    expect(await fx.setProductFields(p.id, "mmp_shop", { page: "All", occasions: ["Birthday"] })).toEqual({ ok: true });
    expect(fx.writes).toEqual([{ type: "metafieldsSet", target: p.id, payload: { namespace: "mmp_shop", page: "All", occasions: ["Birthday"] } }]);
    const again = (await fx.storeProducts(FX_COLLECTION_ID))[0];
    expect([again.page, again.occasions]).toEqual(["All", ["Birthday"]]);
  });
  it("refuses an occasion that isn't in the list", async () => {
    const [p] = await fx.storeProducts(FX_COLLECTION_ID);
    expect(await fx.setProductFields(p.id, "mmp_shop", { occasions: ["Halloween"] })).toEqual({ ok: false, reason: "INCLUSION" });
    expect(fx.writes).toEqual([]);
  });
  it("defines every field in the namespace, products and variants", () => {
    const specs = fieldSpecs(["Christmas"]);
    expect(specs.filter((s) => s.ownerType === "PRODUCT").map((s) => s.key)).toEqual(["page", "occasions", "short_description", "template"]);
    expect(specs.find((s) => s.key === "occasions")?.choices).toEqual(["Christmas"]);
    expect(fieldSpecs([]).find((s) => s.key === "occasions")?.choices).toBeUndefined();
  });
  it("reads the VIP tag from the customer", async () => {
    expect(await fx.customerTags(FX_VIP_EMAIL)).toContain("VIP");
    expect(await fx.customerTags("nobody@elsewhere.test")).toBeNull();
  });
});

describe("field values", () => {
  it("normalises the page", () => {
    expect(normalisePage(" Gifts ")).toBe("gifts");
    expect(normalisePage("ALL")).toBe("all");
    expect(normalisePage("both")).toBeNull();
    expect(normalisePage(null)).toBeNull();
  });
  it("parses list metafields", () => {
    expect(parseList('["Christmas"," For Mom ",""]')).toEqual(["Christmas", "For Mom"]);
    expect(parseList("Christmas")).toEqual([]);
    expect(parseList(null)).toEqual([]);
  });
});
