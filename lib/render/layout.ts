/**
 * Card layout maths, shared by CardPreview (browser) and the server renderer (@napi-rs/canvas),
 * so the preview matches the JPEG. Pure: text measuring is passed in.
 */
import { z } from "zod";

export const FONTS = ["DM Serif Display", "Plus Jakarta Sans"] as const;
export type FontName = (typeof FONTS)[number];

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const textZone = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive().optional(),
  font: z.enum(FONTS),
  size: z.number().positive().max(400),
  minSize: z.number().positive().optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  color,
  align: z.enum(["left", "center", "right"]).default("center"),
  maxLines: z.number().int().min(1).max(12).optional(),
  maxChars: z.number().int().min(1).max(1000).optional(),
  template: z.string().max(200).optional(),
  weight: z.number().int().min(100).max(900).optional(),
});

export const layoutSchema = z.object({
  canvas: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  photo: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    shape: z.enum(["rect", "rounded", "circle", "arch"]).default("rounded"),
    radius: z.number().min(0).optional(),
    frame: z.object({ color, width: z.number().min(0).max(200) }).optional(),
  }),
  text: z.object({ to: textZone, message: textZone, from: textZone }),
  footer: z.object({ y: z.number(), size: z.number().positive(), color }).optional(),
});

export type Layout = z.infer<typeof layoutSchema>;
export type TextZone = z.infer<typeof textZone>;
export type Crop = { zoom: number; x: number; y: number };

export const DEFAULT_CROP: Crop = { zoom: 1, x: 0, y: 0 };

export function parseLayout(v: unknown): Layout {
  return layoutSchema.parse(v);
}

export type Measure = (text: string, font: FontName, size: number, weight?: number) => number;

export type FittedText = { size: number; lines: string[]; lineHeight: number };

export function fill(template: string | undefined, value: string, key: "to" | "from"): string {
  if (!template) return value;
  return template.replace(`{${key}}`, value);
}

function wrap(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the box is broken by characters.
      if (measure(word) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (measure(chunk + ch) > maxWidth && chunk) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      } else line = word;
    }
    out.push(line);
  }
  return out;
}

/**
 * Text shrinks before it wraps and never overflows its box (SPEC §8.4):
 * 1. try one line, shrinking down to minSize (default 70% of size);
 * 2. then wrap at each size from size down to minSize until lines fit maxLines and height;
 * 3. if it still doesn't fit, keep shrinking below minSize (down to 30%) — never overflow.
 */
export function fitText(text: string, zone: TextZone, measure: Measure): FittedText {
  const lh = zone.lineHeight ?? 1.25;
  const maxLines = zone.maxLines ?? (zone.h ? Math.max(1, Math.floor(zone.h / (zone.size * lh))) : 1);
  const minSize = zone.minSize ?? zone.size * 0.7;
  const floor = zone.size * 0.3;
  const step = Math.max(0.5, zone.size * 0.02);
  const m = (size: number) => (s: string) => measure(s, zone.font, size, zone.weight);
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (!clean) return { size: zone.size, lines: [], lineHeight: lh };

  if (!clean.includes("\n")) {
    for (let size = zone.size; size >= minSize; size -= step) {
      if (m(size)(clean) <= zone.w) return { size, lines: [clean], lineHeight: lh };
    }
  }
  for (let size = zone.size; size >= floor; size -= step) {
    const lines = wrap(clean, zone.w, m(size));
    const height = lines.length * size * lh;
    const fitsH = zone.h ? height <= zone.h + 0.5 : true;
    const fitsW = lines.every((l) => m(size)(l) <= zone.w + 0.5);
    if (lines.length <= maxLines && fitsH && fitsW) return { size, lines, lineHeight: lh };
    if (size < minSize && lines.length <= maxLines * 2 && fitsW && zone.h && height <= zone.h + 0.5) return { size, lines, lineHeight: lh };
  }
  // Last resort: smallest size, cut to the box with an ellipsis.
  const lines = wrap(clean, zone.w, m(floor));
  const fitCount = Math.max(1, Math.min(lines.length, zone.h ? Math.floor(zone.h / (floor * lh)) : maxLines));
  const kept = lines.slice(0, fitCount);
  if (lines.length > fitCount) kept[kept.length - 1] = kept[kept.length - 1].replace(/\s*\S*$/, "") + "…";
  return { size: floor, lines: kept, lineHeight: lh };
}

/** Where each line's baseline goes and its x anchor, in canvas pixels. Text is vertically centred in h. */
export function placeLines(fit: FittedText, zone: TextZone): { x: number; y: number; text: string }[] {
  const lineH = fit.size * fit.lineHeight;
  const total = fit.lines.length * lineH;
  const top = zone.h ? zone.y + Math.max(0, (zone.h - total) / 2) : zone.y;
  const x = zone.align === "left" ? zone.x : zone.align === "right" ? zone.x + zone.w : zone.x + zone.w / 2;
  // Baseline ≈ top of line box + (lineH + 0.7·size)/2 (cap-height centring)
  return fit.lines.map((text, i) => ({ x, y: top + i * lineH + (lineH + fit.size * 0.7) / 2, text }));
}

/** The source rectangle of the portrait to draw into the photo zone (cover + zoom + pan). */
export function photoSourceRect(imgW: number, imgH: number, zoneW: number, zoneH: number, crop: Crop = DEFAULT_CROP) {
  const zoom = Math.min(4, Math.max(1, crop.zoom || 1));
  const zoneRatio = zoneW / zoneH;
  let sw = imgW;
  let sh = imgW / zoneRatio;
  if (sh > imgH) {
    sh = imgH;
    sw = imgH * zoneRatio;
  }
  sw /= zoom;
  sh /= zoom;
  const maxX = (imgW - sw) / 2;
  const maxY = (imgH - sh) / 2;
  const cx = imgW / 2 + Math.max(-1, Math.min(1, crop.x || 0)) * maxX;
  const cy = imgH / 2 + Math.max(-1, Math.min(1, crop.y || 0)) * maxY;
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

/** Path for the photo zone shape, as a list of drawing commands both renderers understand. */
export type PathCmd = ["M", number, number] | ["L", number, number] | ["A", number, number, number, number, number] | ["Q", number, number, number, number] | ["Z"];

export function shapePath(p: Layout["photo"], inset = 0): PathCmd[] {
  const x = p.x + inset;
  const y = p.y + inset;
  const w = p.w - inset * 2;
  const h = p.h - inset * 2;
  if (p.shape === "circle") {
    const r = Math.min(w, h) / 2;
    return [["A", x + w / 2, y + h / 2, r, 0, Math.PI * 2], ["Z"]];
  }
  if (p.shape === "arch") {
    const r = w / 2;
    return [["M", x, y + h], ["L", x, y + r], ["A", x + r, y + r, r, Math.PI, Math.PI * 2], ["L", x + w, y + h], ["Z"]];
  }
  const r = p.shape === "rounded" ? Math.max(0, Math.min((p.radius ?? 36) - inset, w / 2, h / 2)) : 0;
  return [
    ["M", x + r, y],
    ["L", x + w - r, y],
    ["Q", x + w, y, x + w, y + r],
    ["L", x + w, y + h - r],
    ["Q", x + w, y + h, x + w - r, y + h],
    ["L", x + r, y + h],
    ["Q", x, y + h, x, y + h - r],
    ["L", x, y + r],
    ["Q", x, y, x + r, y],
    ["Z"],
  ];
}

type Ctx2D = {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
};

export function tracePath(ctx: Ctx2D, cmds: PathCmd[]) {
  ctx.beginPath();
  for (const c of cmds) {
    if (c[0] === "M") ctx.moveTo(c[1], c[2]);
    else if (c[0] === "L") ctx.lineTo(c[1], c[2]);
    else if (c[0] === "A") ctx.arc(c[1], c[2], c[3], c[4], c[5]);
    else if (c[0] === "Q") ctx.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else ctx.closePath();
  }
}

/** CSS clip-path / border-radius for the preview's photo zone. */
export function cssShape(p: Layout["photo"]): { borderRadius?: string; clipPath?: string } {
  if (p.shape === "circle") return { borderRadius: "50%" };
  if (p.shape === "arch") return { borderRadius: `${(50).toFixed(0)}% ${(50).toFixed(0)}% 0 0 / ${((p.w / 2 / p.h) * 100).toFixed(2)}% ${((p.w / 2 / p.h) * 100).toFixed(2)}% 0 0` };
  if (p.shape === "rounded") return { borderRadius: `${(((p.radius ?? 36) / p.w) * 100).toFixed(3)}% / ${(((p.radius ?? 36) / p.h) * 100).toFixed(3)}%` };
  return {};
}

/** The message ideas that can be used: `{pet}` ideas are skipped when the pet name is unknown. */
export function usableIdeas(ideas: string[], petName: string | null | undefined, to?: string): string[] {
  return ideas
    .filter((i) => petName || !i.includes("{pet}"))
    .map((i) => i.replaceAll("{pet}", petName ?? "").replaceAll("{to}", to ?? ""));
}
