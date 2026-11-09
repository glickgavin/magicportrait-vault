/**
 * The one drawing routine for a card, used by the server renderer (@napi-rs/canvas) and the browser
 * preview (HTML canvas), so what you see is what you get.
 */
import { weightFor } from "./fonts";
import { fill, fitText, fittedPhoto, isShown, photoSourceRect, placeLines, shapePath, tracePath, type Crop, type FontName, type Layout, type Measure } from "./layout";

export type DrawImage = { width: number; height: number };

/** The subset of CanvasRenderingContext2D both canvases provide. */
export interface Ctx {
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(img: DrawImage, ...args: number[]): void;
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
  imageSmoothingEnabled: boolean;
}

export type DrawInput = {
  layout: Layout;
  background: DrawImage | null;
  overlay?: DrawImage | null;
  portrait: DrawImage | null;
  crop?: Crop;
  to: string;
  from: string;
  message: string;
  footerText?: string;
  photoBg?: string;
};


/** `family` maps our font names to the CSS family the canvas knows (next/font renames them in the browser). */
export function fontString(font: FontName, size: number, weight: number | undefined, family: (f: FontName) => string) {
  return `${weightFor(font, weight)} ${size.toFixed(2)}px ${family(font)}`;
}

export function measurer(ctx: Ctx, family: (f: FontName) => string): Measure {
  return (text, font, size, weight) => {
    ctx.font = fontString(font, size, weight, family);
    return ctx.measureText(text).width;
  };
}

export function drawLayers(ctx: Ctx, input: DrawInput, family: (f: FontName) => string, letterSpacing?: (px: number) => void) {
  const { layout } = input;
  const W = layout.canvas.w;
  const H = layout.canvas.h;
  if (input.background) ctx.drawImage(input.background, 0, 0, W, H);
  else {
    ctx.fillStyle = "#F5F1E6";
    ctx.fillRect(0, 0, W, H);
  }

  // The photo window follows the portrait's own shape ("adapt"), or stays as designed ("cover").
  const p = fittedPhoto(layout.photo, input.portrait?.width, input.portrait?.height);
  const photoOn = isShown(layout.photo);
  const frameW = p.frame?.width ?? 0;
  if (photoOn && p.frame && frameW > 0) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = p.frame.color;
    tracePath(ctx, shapePath(p));
    ctx.fill();
    ctx.restore();
  }
  if (photoOn) {
    ctx.save();
    tracePath(ctx, shapePath(p, frameW));
    ctx.clip();
    ctx.fillStyle = input.photoBg ?? "#E8E2D8";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (input.portrait) {
      const zw = p.w - frameW * 2;
      const zh = p.h - frameW * 2;
      const s = photoSourceRect(input.portrait.width, input.portrait.height, zw, zh, input.crop);
      ctx.drawImage(input.portrait, s.sx, s.sy, s.sw, s.sh, p.x + frameW, p.y + frameW, zw, zh);
    }
    ctx.restore();
  }

  const measure = measurer(ctx, family);
  const texts: [keyof Layout["text"], string][] = [
    ["to", fill(layout.text.to.template, input.to, "to")],
    ["message", input.message],
    ["from", fill(layout.text.from.template, input.from, "from")],
  ];
  for (const [key, value] of texts) {
    const zone = layout.text[key];
    if (!isShown(zone)) continue;
    const fit = fitText(value, zone, measure);
    ctx.fillStyle = zone.color;
    ctx.textAlign = zone.align;
    ctx.textBaseline = "alphabetic";
    ctx.font = fontString(zone.font, fit.size, zone.weight, family);
    for (const l of placeLines(fit, zone)) ctx.fillText(l.text, l.x, l.y);
  }

  if (input.footerText && layout.footer) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = layout.footer.color;
    ctx.textAlign = "center";
    ctx.font = fontString("Plus Jakarta Sans", layout.footer.size, 600, family);
    letterSpacing?.(Math.round(layout.footer.size * 0.12));
    ctx.fillText(input.footerText.toUpperCase(), W / 2, layout.footer.y);
    ctx.restore();
  }

  // The overlay is always the top layer, above the portrait, frame and text (its transparent areas
  // let everything below show through).
  if (input.overlay) ctx.drawImage(input.overlay, 0, 0, W, H);
}
