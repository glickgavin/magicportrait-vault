import { describe, expect, it } from "vitest";
import { getCatalog } from "@/lib/shop";
import { rulesFor, rulesUpdateSchema, updateVariantRules, variantRulesSchema } from "@/lib/shop/admin";
import { shopFixtures } from "@/lib/shop/sources";

const actor = { email: "test@example.com" };
const blank = { maker: "", maker_sku: "", print_px: "", placement: "", zone_px: "", min_short_side_px: "", max_crop_pct: "", adjustable: "", image_kinds: "" };

async function puzzle() {
  const e = (await getCatalog({ fresh: true })).find((x) => x.product.handle === "fx-puzzle")!;
  return e;
}

describe("Settings › Shop › Print rules", () => {
  it("sets and clears only the rules that changed, in mmp_shop, and the size becomes ready", async () => {
    const p = await puzzle();
    const [a, b] = p.product.variants;
    const fx = shopFixtures();
    fx.writes.length = 0;
    const r = await updateVariantRules(actor, {
      productId: p.product.id,
      variants: [
        { variantId: a.id, rules: { ...rulesFor(a.metafields), maker: "prodigi", maker_sku: "JIGSAW-PUZZLE-252", print_px: "4429X3366", min_short_side_px: "1200" } },
        { variantId: b.id, rules: rulesFor(b.metafields) },
      ],
    });
    expect(r).toEqual({ ok: true });
    // One size changed; the other wasn't written at all.
    expect(fx.writes).toHaveLength(1);
    expect(fx.writes[0]).toMatchObject({ target: a.id, payload: { namespace: "mmp_shop" } });
    const after = (await puzzle()).product.variants.find((v) => v.id === a.id)!;
    expect(rulesFor(after.metafields)).toMatchObject({ maker: "prodigi", maker_sku: "JIGSAW-PUZZLE-252", print_px: "4429x3366", min_short_side_px: "1200" });
    expect((await puzzle()).sellable.find((s) => s.variant.id === a.id)?.rules).toMatchObject({ maker: "prodigi", printPx: { w: 4429, h: 3366 }, minShortSidePx: 1200 });

    // Clearing an optional rule removes it (the default applies again); saving again with no change writes nothing.
    fx.writes.length = 0;
    const now = rulesFor(after.metafields);
    expect(await updateVariantRules(actor, { productId: p.product.id, variants: [{ variantId: a.id, rules: { ...now, min_short_side_px: "" } }] })).toEqual({ ok: true });
    expect((fx.writes[0].payload as { clear: string[] }).clear).toEqual(["min_short_side_px"]);
    fx.writes.length = 0;
    expect(await updateVariantRules(actor, { productId: p.product.id, variants: [{ variantId: a.id, rules: { ...now, min_short_side_px: "" } }] })).toEqual({ ok: true });
    expect(fx.writes).toHaveLength(0);
  });

  it("refuses sizes from another product and products outside the Store collection", async () => {
    const p = await puzzle();
    const other = (await getCatalog({ fresh: true })).find((x) => x.product.handle === "fx-mug")!;
    expect(await updateVariantRules(actor, { productId: p.product.id, variants: [{ variantId: other.product.variants[0].id, rules: blank }] })).toMatchObject({ ok: false, status: 400 });
    expect(await updateVariantRules(actor, { productId: "gid://shopify/Product/1", variants: [{ variantId: p.product.variants[0].id, rules: blank }] })).toMatchObject({ ok: false, status: 404 });
  });

  it("validates every value", () => {
    expect(variantRulesSchema.safeParse({ ...blank, print_px: "4429x3366" }).success).toBe(true);
    expect(variantRulesSchema.safeParse({ ...blank, print_px: "big" }).success).toBe(false);
    expect(variantRulesSchema.safeParse({ ...blank, maker: "someone" }).success).toBe(false);
    expect(variantRulesSchema.safeParse({ ...blank, maker_sku: "has space" }).success).toBe(false);
    expect(variantRulesSchema.safeParse({ ...blank, max_crop_pct: "95" }).success).toBe(false);
    expect(variantRulesSchema.safeParse({ ...blank, adjustable: "maybe" }).success).toBe(false);
    expect(rulesUpdateSchema.safeParse({ productId: "gid://shopify/Product/1", variants: [] }).success).toBe(false);
  });
});
