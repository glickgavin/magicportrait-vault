import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { layerSchema } from "@/lib/shop/layer";
import { composePrintFile } from "@/lib/shop/print-file";

// The border in the print file (docs/shop.md › Personalisation layer): the picture inside an even margin, at print size.

describe("the print file with Add border", () => {
  it("keeps the print size, puts the border's colour in the margin and the picture inside it", async () => {
    const layer = layerSchema.parse({ enabled: true, texts: [], border: { color: "#FFFFFF", width: 0.05 } });
    const pic = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#203040" } }).png().toBuffer();
    const out = await composePrintFile(pic, { crop: { x: 0, y: 0, w: 900, h: 1200 }, printPx: { w: 1200, h: 1600 }, layer: { layer, values: { border: true, borderWidth: 0.05 } } });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1200, 1600]);
    const px = (x: number, y: number) => [...data.subarray((y * 1200 + x) * 3, (y * 1200 + x) * 3 + 3)];
    // The margin is 5% of 1200 = 60 px on every side.
    for (const [x, y] of [[10, 10], [1190, 800], [600, 1590], [30, 1500]]) expect(Math.min(...px(x, y))).toBeGreaterThan(245);
    for (const [x, y] of [[70, 70], [600, 800], [1130, 1530]]) expect(px(x, y)[0]).toBeLessThan(60);
  });

  it("without the border picked, the picture is edge to edge", async () => {
    const layer = layerSchema.parse({ enabled: true, texts: [], border: { width: 0.05 } });
    const pic = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#203040" } }).png().toBuffer();
    const out = await composePrintFile(pic, { crop: { x: 0, y: 0, w: 900, h: 1200 }, printPx: { w: 1200, h: 1600 }, layer: { layer, values: { border: false } } });
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(data[(10 * 1200 + 10) * 3]).toBeLessThan(60);
  });
});
