import { describe, expect, it } from "vitest";
import { getProductSetting } from "@/lib/settings/product";
import { productFieldProblems } from "@/lib/settings/product-fields";
import { planCopy } from "@/lib/shop/copy-settings";
import { defaultLayerText } from "@/lib/shop/layer";
import { adminProducts } from "@/lib/shop";
import { shopFixtures } from "@/lib/shop/sources";
import type { ShopProduct } from "@/lib/shop/sources/types";

// "Ask for the pet's name" per product (docs/open-store.md › Generation settings): the name next to the photo goes to
// Imagen; a product whose personalisation layer asks for the name turns it off, so nobody is asked twice.

async function pillow(): Promise<ShopProduct> {
  shopFixtures().reset();
  return structuredClone((await adminProducts()).find((p) => p.handle === "fx-pillow")!);
}
const withGeneration = (p: ShopProduct, g: Record<string, unknown>): ShopProduct => ({ ...p, store: { ...p.store!, generation: JSON.stringify(g) } });
const withLayer = (p: ShopProduct): ShopProduct => {
  const t = JSON.parse(p.template!.value) as Record<string, unknown>;
  return { ...p, template: { value: JSON.stringify({ ...t, layer: { enabled: true, texts: [defaultLayerText("t1")], art: null } }), updatedAt: null } };
};

describe("ask for the pet's name", () => {
  it("is on by default (the store setting), and a product can turn it off", async () => {
    const p = await pillow();
    expect(await getProductSetting(p, "ask_name")).toBe(true);
    expect(await getProductSetting(withGeneration(p, { ask_name: false }), "ask_name")).toBe(false);
  });

  it("Settings warns when the name is asked twice, and stops when it's turned off", async () => {
    const p = withLayer(await pillow());
    expect(productFieldProblems(p).map((x) => x.key)).toContain("ask_name");
    expect(productFieldProblems(withGeneration(p, { ask_name: false })).map((x) => x.key)).not.toContain("ask_name");
    expect(productFieldProblems(await pillow()).map((x) => x.key)).not.toContain("ask_name");
  });

  it("Copy settings carries it", async () => {
    const from = withGeneration(await pillow(), { ask_name: false });
    const to = { ...(await pillow()), id: "gid://shopify/Product/1" };
    expect(planCopy(from, to, ["magic_store"]).fields?.generation).toMatchObject({ ask_name: false });
  });
});
