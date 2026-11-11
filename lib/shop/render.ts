import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage, type Canvas, type Image } from "@napi-rs/canvas";
import { getSettings } from "@/lib/settings";
import type { Rect } from "./fit";
import { drawPreview, previewSize, type MakeCanvas, type PreviewCtx } from "./preview";
import type { Template } from "./template";

/** Server drawing of a shop preview (cart thumbnails, the order line's preview), with the shared routine. */
export const makeServerCanvas: MakeCanvas = (w, h) => {
  const canvas = createCanvas(w, h);
  return { canvas, ctx: canvas.getContext("2d") as unknown as PreviewCtx };
};

const imageCache = new Map<string, { at: number; img: Image }>();

/** A template photo: Shopify's CDN (allowed hosts only) or, in fixtures, a file under public/. */
export async function loadTemplateImage(url: string): Promise<Image | null> {
  const hit = imageCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.img;
  let buf: Buffer | null = null;
  if (url.startsWith("/fixtures/shop/") && !url.includes("..")) {
    buf = await readFile(path.join(process.cwd(), "public", url)).catch(() => null);
  } else {
    const s = await getSettings(["shop.template_image_hosts", "shop.image_fetch_timeout_ms", "shop.image_fetch_max_mb"] as const);
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || !s["shop.template_image_hosts"].includes(u.hostname)) return null;
    const r = await fetch(u, { signal: AbortSignal.timeout(s["shop.image_fetch_timeout_ms"]), cache: "no-store" }).catch(() => null);
    if (r?.ok) {
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length <= s["shop.image_fetch_max_mb"] * 1024 * 1024) buf = b;
    }
  }
  if (!buf) return null;
  const img = await loadImage(buf).catch(() => null);
  if (img) {
    if (imageCache.size > 50) imageCache.clear();
    imageCache.set(url, { at: Date.now(), img });
  }
  return img;
}

export type RenderInput = {
  template: Template;
  picture: Buffer;
  crop: Rect;
  placement: "cover" | "contain" | "wrap_zone";
  backgroundColour: string | null;
  targetAspect: number;
  width: number;
  /** Already-loaded template photos (tests pass their own). */
  images?: { background: Image; overlay: Image | null };
};

/** Draws the preview and returns it as a JPEG (or PNG for tests). */
export async function renderPreview(input: RenderInput, format: "jpeg" | "png" = "jpeg"): Promise<Buffer | null> {
  const background = input.images?.background ?? (await loadTemplateImage(input.template.background.url));
  if (!background) return null;
  const overlay = input.images ? input.images.overlay : input.template.overlay ? await loadTemplateImage(input.template.overlay.url) : null;
  const picture = await loadImage(input.picture);
  const size = previewSize(input.template, input.width);
  const { canvas, ctx } = makeServerCanvas(size.w, size.h);
  drawPreview(ctx, { template: input.template, background, overlay, picture, crop: input.crop, placement: input.placement, backgroundColour: input.backgroundColour, targetAspect: input.targetAspect, size, makeCanvas: makeServerCanvas });
  const c = canvas as Canvas;
  return format === "png" ? c.encode("png") : c.encode("jpeg", 88);
}
