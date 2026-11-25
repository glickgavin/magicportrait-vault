import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import { drawLayer, type Layer, type LayerValues } from "./layer";

/**
 * The print file (docs/shop.md › Print file): the customer's picture cropped as they saw it and sized to the print
 * area, with the personalisation layer drawn on top when they filled one in. The layer is drawn by the same routine
 * as the previews, at print size, so the words and picture land where the customer saw them.
 */
export type PrintFileInput = {
  crop: { x: number; y: number; w: number; h: number } | null;
  printPx: { w: number; h: number };
  /** The layer as it was when the order was paid, and what the customer filled in. */
  layer?: { layer: Layer; values: LayerValues } | null;
};

export async function composePrintFile(picture: Buffer, input: PrintFileInput): Promise<Buffer> {
  let img = sharp(picture, { limitInputPixels: 200_000_000 }).rotate();
  const meta = await sharp(picture, { limitInputPixels: 200_000_000 }).rotate().metadata();
  const c = input.crop;
  if (c && meta.width && meta.height && c.x + c.w <= meta.width && c.y + c.h <= meta.height) img = img.extract({ left: c.x, top: c.y, width: c.w, height: c.h });
  const sized = img.resize(input.printPx.w, input.printPx.h, { fit: "cover", position: "top" }).flatten({ background: "#ffffff" });
  if (!input.layer) return sized.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  const { serverLayer } = await import("./layer-server");
  const draw = await serverLayer(input.layer.layer, input.layer.values);
  if (!draw) return sized.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  const base = await loadImage(await sized.png().toBuffer());
  const canvas = createCanvas(input.printPx.w, input.printPx.h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(base, 0, 0);
  drawLayer(ctx as unknown as Parameters<typeof drawLayer>[0], input.printPx.w, input.printPx.h, draw);
  // Back through sharp for the same JPEG settings as a plain print file.
  return sharp(await canvas.encode("png")).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}
