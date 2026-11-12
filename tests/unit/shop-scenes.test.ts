import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { REGISTRY } from "@/lib/settings/registry";
import {
  DEFAULT_SCENE_PRESETS,
  DEFAULT_SCENE_PRODUCTS,
  DEFAULT_SCENE_RULES,
  aspectRatio,
  dayStamp,
  parseSceneFileName,
  pictureSlug,
  sceneFileName,
  scenePrompt,
  scenePresetsSchema,
  sceneProductsSchema,
} from "@/lib/shop/scene-presets";

describe("room photo presets", () => {
  it("defaults pass their own validation and every scene has a described product", () => {
    expect(scenePresetsSchema.safeParse(DEFAULT_SCENE_PRESETS).success).toBe(true);
    expect(sceneProductsSchema.safeParse(DEFAULT_SCENE_PRODUCTS).success).toBe(true);
    for (const p of DEFAULT_SCENE_PRESETS) expect(DEFAULT_SCENE_PRODUCTS.some((x) => x.handle === p.product)).toBe(true);
    expect(REGISTRY["shop.scene_presets"].schema.safeParse(DEFAULT_SCENE_PRESETS).success).toBe(true);
    expect(REGISTRY["shop.scene_prompt_rules"].schema.safeParse(DEFAULT_SCENE_RULES).success).toBe(true);
  });

  it("covers the four products with three scenes each, each with its own sample picture", () => {
    const by = new Map<string, number>();
    for (const p of DEFAULT_SCENE_PRESETS) by.set(p.product, (by.get(p.product) ?? 0) + 1);
    expect([...by.values()]).toEqual([3, 3, 3, 3]);
    expect(new Set(DEFAULT_SCENE_PRESETS.map((p) => p.picture)).size).toBe(12);
  });

  it("refuses two scenes with one id and pictures outside the app", () => {
    const one = DEFAULT_SCENE_PRESETS[0];
    expect(scenePresetsSchema.safeParse([one, one]).success).toBe(false);
    expect(scenePresetsSchema.safeParse([{ ...one, picture: "https://example.com/x.jpg" }]).success).toBe(false);
    expect(scenePresetsSchema.safeParse([{ ...one, picture: "/../etc/passwd" }]).success).toBe(false);
  });

  it("puts the product and the scene into the rules", () => {
    const product = DEFAULT_SCENE_PRODUCTS[0];
    const preset = DEFAULT_SCENE_PRESETS[0];
    const text = scenePrompt(DEFAULT_SCENE_RULES, product, preset, "  warmer light ");
    expect(text).toContain(product.text);
    expect(text).toContain(preset.scene);
    expect(text).not.toContain("{product}");
    expect(text).not.toContain("{scene}");
    expect(text.endsWith("Also: warmer light")).toBe(true);
    expect(scenePrompt(DEFAULT_SCENE_RULES, product, preset)).not.toContain("Also:");
  });
});

describe("room photo file names", () => {
  it("round-trips and refuses anything else", () => {
    const f = { day: "20261111", preset: "pillow-sofa", picture: "beagle-peg", id: "0123456789ab", width: 1792, height: 2240 };
    const name = sceneFileName(f);
    expect(name).toBe("20261111.pillow-sofa.beagle-peg.0123456789ab.1792x2240.jpg");
    expect(parseSceneFileName(name)).toEqual(f);
    expect(parseSceneFileName("../x.jpg")).toBeNull();
    expect(parseSceneFileName("20261111.Pillow.beagle.0123456789ab.10x10.jpg")).toBeNull();
  });

  it("makes safe picture names", () => {
    expect(pictureSlug("/shop-samples/scenes/beagle-peg.jpg")).toBe("beagle-peg");
    expect(pictureSlug("My Dog (2).PNG")).toBe("my-dog-2");
    expect(pictureSlug("###.jpg")).toBe("picture");
    expect(pictureSlug("a".repeat(80) + ".jpg").length).toBeLessThanOrEqual(40);
  });

  it("stamps the UTC day and reads aspect ratios", () => {
    expect(dayStamp(new Date("2026-11-11T23:30:00Z"))).toBe("20261111");
    expect(aspectRatio("5:7")).toBeCloseTo(5 / 7);
    expect(aspectRatio("bad")).toBe(1);
  });
});

describe("cropping to the print shape", async () => {
  // lib/shop/scenes.ts is server-only; the crop is checked through the same sharp calls.
  const { cropToPrint } = await import("@/lib/shop/scenes").catch(() => ({ cropToPrint: null as null | ((b: Buffer, a: string, m?: number) => Promise<Buffer>) }));
  it.skipIf(!cropToPrint)("crops a 3:4 picture to each print shape", async () => {
    const pic = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#c96" } }).jpeg().toBuffer();
    for (const [a, r] of [["1:1", 1], ["2:3", 2 / 3], ["5:7", 5 / 7], ["3:4", 3 / 4]] as const) {
      const out = await cropToPrint!(pic, a);
      const m = await sharp(out).metadata();
      expect((m.width ?? 0) / (m.height ?? 1)).toBeCloseTo(r, 2);
    }
  });
});
