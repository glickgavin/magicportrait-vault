import { createCanvas, GlobalFonts, loadImage, type Image } from "@napi-rs/canvas";
import path from "node:path";
import { existsSync } from "node:fs";
import { drawLayers, type Ctx, type DrawInput } from "./draw";
import type { FontName } from "./layout";

let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "assets/fonts");
  const reg = (file: string, family: string) => {
    const p = path.join(dir, file);
    if (existsSync(p)) GlobalFonts.registerFromPath(p, family);
  };
  reg("DMSerifDisplay-Regular.ttf", "DM Serif Display");
  reg("PlusJakartaSans.ttf", "Plus Jakarta Sans");
  fontsReady = true;
}

const serverFamily = (f: FontName) => `"${f}"`;

export type RenderInput = Omit<DrawInput, "background" | "overlay" | "portrait"> & {
  background: Buffer | Image | null;
  overlay?: Buffer | Image | null;
  portrait: Buffer | Image | null;
  size?: { w: number; h: number };
};

async function img(src: Buffer | Image | null | undefined): Promise<Image | null> {
  if (!src) return null;
  return Buffer.isBuffer(src) ? loadImage(src) : src;
}

export async function drawCard(input: RenderInput) {
  registerFonts();
  const out = input.size ?? input.layout.canvas;
  const canvas = createCanvas(out.w, out.h);
  const ctx = canvas.getContext("2d");
  ctx.scale(out.w / input.layout.canvas.w, out.h / input.layout.canvas.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const [background, overlay, portrait] = await Promise.all([img(input.background), img(input.overlay), img(input.portrait)]);
  drawLayers(ctx as unknown as Ctx, { ...input, background, overlay, portrait }, serverFamily, (px) => {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`;
  });
  return canvas;
}

export async function renderCardJpeg(input: RenderInput & { quality?: number }): Promise<{ jpeg: Buffer; ms: number }> {
  const t = Date.now();
  const canvas = await drawCard(input);
  const jpeg = await canvas.encode("jpeg", input.quality ?? 90);
  return { jpeg, ms: Date.now() - t };
}
