import { z } from "zod";
import { weightFor } from "@/lib/render/fonts";
import { FONTS, fitText, placeLines, type FontName, type TextZone } from "@/lib/render/layout";

/**
 * The personalisation layer (docs/shop.md › Personalisation layer): up to two text boxes and one picture slot,
 * set up in the template editor and filled in by the Magic Store customer. It sits on top of the customer's
 * picture, in the print area, so the preview, the mockup and the print file all show the same thing.
 *
 * Boxes are fractions of the print area (0–1). Text sizes are fractions of the print area's height, so the
 * layer looks the same at any size, from a 400 px preview to a 6000 px print file. Pure: the browser and the
 * server draw it with the same code.
 */

export const LAYER_TEXT_IDS = ["t1", "t2"] as const;
export type LayerTextId = (typeof LAYER_TEXT_IDS)[number];
export const LAYER_ART_MAX = 3;

const unit = z.number().min(0).max(1);
export const layerBox = z
  .object({ x: unit, y: unit, w: z.number().min(0.02).max(1), h: z.number().min(0.02).max(1) })
  .refine((b) => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, "The box must stay inside the print area");
export type LayerBox = z.infer<typeof layerBox>;

const words = (max: number) => z.string().trim().max(max);

export const layerTextSchema = z
  .object({
    id: z.enum(LAYER_TEXT_IDS),
    label: words(40).min(1),
    placeholder: words(60).default(""),
    required: z.boolean().default(false),
    maxChars: z.number().int().min(1).max(120).default(30),
    box: layerBox,
    font: z.enum(FONTS),
    weight: z.number().int().min(100).max(900).optional(),
    /** Fraction of the print area's height. */
    size: z.number().min(0.01).max(0.5),
    /** Fraction of the print area's height; the text shrinks to this before it wraps. Default 60% of size. */
    minSize: z.number().min(0.005).max(0.5).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    align: z.enum(["left", "center", "right"]).default("center"),
    maxLines: z.number().int().min(1).max(6).default(1),
  })
  .refine((t) => !t.minSize || t.minSize <= t.size, "The smallest size can't be bigger than the size");
export type LayerText = z.infer<typeof layerTextSchema>;

export const layerArtSchema = z.object({
  label: words(40).min(1),
  required: z.boolean().default(false),
  box: layerBox,
  /** Ids from the art library (`layer_art`); the customer picks one. */
  choices: z.array(z.string().uuid()).min(1).max(LAYER_ART_MAX),
});
export type LayerArt = z.infer<typeof layerArtSchema>;

export const layerSchema = z
  .object({
    enabled: z.boolean(),
    texts: z.array(layerTextSchema).max(LAYER_TEXT_IDS.length).default([]),
    art: layerArtSchema.nullable().default(null),
  })
  .refine((l) => new Set(l.texts.map((t) => t.id)).size === l.texts.length, "Each text box once")
  .refine((l) => new Set(l.art?.choices ?? []).size === (l.art?.choices.length ?? 0), "Each picture once");
export type Layer = z.infer<typeof layerSchema>;

/** What the customer filled in. Text is the customer's own words: never logged or sent to analytics. */
export type LayerValues = { t1?: string; t2?: string; art?: string | null };

/** True when a layer is on and has something to fill in. */
export function layerActive(layer: Layer | null | undefined): layer is Layer {
  return Boolean(layer?.enabled && (layer.texts.length || layer.art));
}

/** The customer's text made safe to print: no control characters, single spaces, cut to the box's limit. */
export function cleanLayerText(v: unknown, maxChars: number): string {
  if (typeof v !== "string") return "";
  const s = v.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return [...s].slice(0, maxChars).join("").trim();
}

export type LayerCheck = { ok: true; values: LayerValues } | { ok: false; error: string; field: LayerTextId | "art" };

/** Checks what the customer filled in against the layer: required boxes, lengths, and a picture from its choices. */
export function checkLayerValues(layer: Layer, raw: unknown): LayerCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const values: LayerValues = {};
  for (const t of layer.texts) {
    if (typeof r[t.id] === "string" && [...(r[t.id] as string).trim()].length > t.maxChars) return { ok: false, field: t.id, error: `${t.label}: at most ${t.maxChars} characters.` };
    const v = cleanLayerText(r[t.id], t.maxChars);
    if (t.required && !v) return { ok: false, field: t.id, error: `${t.label}: please fill this in.` };
    if (v) values[t.id] = v;
  }
  if (layer.art) {
    const a = typeof r.art === "string" && r.art ? r.art : null;
    if (a && !layer.art.choices.includes(a)) return { ok: false, field: "art", error: `${layer.art.label}: choose one of the pictures shown.` };
    if (layer.art.required && !a) return { ok: false, field: "art", error: `${layer.art.label}: please choose one.` };
    values.art = a;
  }
  return { ok: true, values };
}

/** The canvas calls the layer needs; both HTML canvas and @napi-rs/canvas have them. */
export interface LayerCtx {
  save(): void;
  restore(): void;
  drawImage(img: { width: number; height: number }, ...args: number[]): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
}

export type LayerDraw = {
  layer: Layer;
  values: LayerValues;
  /** The art library's pictures, loaded, by id (only the chosen one is needed). */
  art: Map<string, { width: number; height: number }>;
  /** Maps a font name to the family the canvas knows (next/font renames the brand fonts in the browser). */
  family: (f: FontName) => string;
};

/** A text box in pixels, in the shape `fitText` takes. */
export function textZone(t: LayerText, w: number, h: number): TextZone {
  const size = t.size * h;
  return {
    x: t.box.x * w,
    y: t.box.y * h,
    w: t.box.w * w,
    h: t.box.h * h,
    font: t.font,
    size,
    minSize: (t.minSize ?? t.size * 0.6) * h,
    lineHeight: 1.15,
    color: t.color,
    align: t.align,
    maxLines: t.maxLines,
    weight: t.weight,
  };
}

/** Where a picture sits in its box: as big as fits, centred, never stretched. */
export function containIn(box: LayerBox, w: number, h: number, imgW: number, imgH: number) {
  const bw = box.w * w;
  const bh = box.h * h;
  const s = Math.min(bw / imgW, bh / imgH);
  const dw = imgW * s;
  const dh = imgH * s;
  return { x: box.x * w + (bw - dw) / 2, y: box.y * h + (bh - dh) / 2, w: dw, h: dh };
}

/** Draws the layer over a w × h print area (the flat picture, before it's warped or masked). */
export function drawLayer(ctx: LayerCtx, w: number, h: number, input: LayerDraw) {
  const { layer, values } = input;
  if (!layerActive(layer)) return;
  ctx.save();
  if (layer.art && values.art) {
    const img = input.art.get(values.art);
    if (img && img.width > 0 && img.height > 0) {
      const r = containIn(layer.art.box, w, h, img.width, img.height);
      ctx.drawImage(img, 0, 0, img.width, img.height, r.x, r.y, r.w, r.h);
    }
  }
  const font = (f: FontName, size: number, weight?: number) => `${weightFor(f, weight)} ${size.toFixed(2)}px ${input.family(f)}`;
  const measure = (text: string, f: FontName, size: number, weight?: number) => {
    ctx.font = font(f, size, weight);
    return ctx.measureText(text).width;
  };
  for (const t of layer.texts) {
    const text = cleanLayerText(values[t.id], t.maxChars);
    if (!text) continue;
    const zone = textZone(t, w, h);
    const fit = fitText(text, zone, measure);
    ctx.fillStyle = t.color;
    ctx.textAlign = t.align;
    ctx.textBaseline = "alphabetic";
    ctx.font = font(t.font, fit.size, t.weight);
    for (const l of placeLines(fit, zone)) ctx.fillText(l.text, l.x, l.y);
  }
  ctx.restore();
}

/** Line properties for the order: only what the customer filled in, under fixed names (docs/schema.md). */
export const LAYER_ATTR = { t1: "_shop_layer_t1", t2: "_shop_layer_t2", art: "_shop_layer_art" } as const;

export function layerAttributes(values: LayerValues): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (values.t1) out.push({ key: LAYER_ATTR.t1, value: values.t1 });
  if (values.t2) out.push({ key: LAYER_ATTR.t2, value: values.t2 });
  if (values.art) out.push({ key: LAYER_ATTR.art, value: values.art });
  return out;
}

/** The customer's values back from an order line's properties. */
export function layerValuesFromProps(props: Record<string, string>): LayerValues | null {
  const v: LayerValues = {};
  if (props[LAYER_ATTR.t1]) v.t1 = props[LAYER_ATTR.t1];
  if (props[LAYER_ATTR.t2]) v.t2 = props[LAYER_ATTR.t2];
  if (props[LAYER_ATTR.art]) v.art = props[LAYER_ATTR.art];
  return Object.keys(v).length ? v : null;
}

/** A starting text box for the editor. */
export function defaultLayerText(id: LayerTextId): LayerText {
  return {
    id,
    label: id === "t1" ? "Their name" : "A short line",
    placeholder: id === "t1" ? "Teddy" : "Best boy",
    required: false,
    maxChars: id === "t1" ? 16 : 30,
    box: id === "t1" ? { x: 0.1, y: 0.78, w: 0.8, h: 0.12 } : { x: 0.15, y: 0.9, w: 0.7, h: 0.06 },
    font: "Playfair Display",
    size: id === "t1" ? 0.08 : 0.04,
    color: "#FFFFFF",
    align: "center",
    maxLines: 1,
  };
}
