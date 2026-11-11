// Draws each product's preview with the shop's own routine (lib/shop/preview.ts), a made-up picture in.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { drawPreview, previewSize } from "../../lib/shop/preview.ts";
import { parseTemplate } from "../../lib/shop/template.ts";
import { centredCrop } from "../../lib/shop/fit.ts";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const make = (w: number, h: number) => { const canvas = createCanvas(w, h); return { canvas, ctx: canvas.getContext("2d") }; };

const [dir, outDir, picPath, width, ...items] = process.argv.slice(2);
const pic = await loadImage(readFileSync(picPath));
for (const item of items) {
  const [name, aspect] = item.split(":");
  const raw = JSON.parse(readFileSync(`${dir}/${name}-template.json`, "utf8"));
  raw.background.url = raw.overlay.url = "https://cdn.shopify.com/x.png";
  raw.background.media_id = "gid://shopify/MediaImage/1";
  raw.overlay.media_id = "gid://shopify/MediaImage/2";
  const t = parseTemplate(JSON.stringify(raw));
  if (!t) throw new Error(`bad template ${name}`);
  const [aw, ah] = aspect.split("x").map(Number);
  const crop = centredCrop(pic.width, pic.height, aw, ah);
  const background = await loadImage(readFileSync(`${dir}/${name}-base.jpg`));
  const overlay = await loadImage(readFileSync(`${dir}/${name}-overlay.png`));
  const size = previewSize(t, Number(width));
  const { canvas, ctx } = make(size.w, size.h);
  drawPreview(ctx as never, { template: t, background, overlay, picture: pic, crop, placement: t.zone.kind === "wrap" ? "wrap_zone" : "cover", backgroundColour: null, targetAspect: aw / ah, size, makeCanvas: make as never });
  writeFileSync(`${outDir}/${name}.jpg`, canvas.encode ? await canvas.encode("jpeg", 90) : canvas.toBuffer("image/jpeg"));
}
console.log("previews", items.length);
