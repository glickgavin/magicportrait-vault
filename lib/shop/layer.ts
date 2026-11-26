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
    /** Turn, in degrees (clockwise), about the box's centre. 0 = level; templates saved before 26 Nov have none. */
    rotate: z.number().min(-180).max(180).default(0),
  })
  .refine((t) => !t.minSize || t.minSize <= t.size, "The smallest size can't be bigger than the size");
export type LayerText = z.infer<typeof layerTextSchema>;

export const layerArtSchema = z.object({
  label: words(40).min(1),
  required: z.boolean().default(false),
  box: layerBox,
  /** Turn, in degrees, about the box's centre. Only a customer's repositioning sets it (see `positionedLayer`). */
  rotate: z.number().min(-180).max(180).optional(),
  /** Ids from the art library (`layer_art`); the customer picks one. */
  choices: z.array(z.string().uuid()).min(1).max(LAYER_ART_MAX),
});
export type LayerArt = z.infer<typeof layerArtSchema>;

export const layerSchema = z
  .object({
    enabled: z.boolean(),
    texts: z.array(layerTextSchema).max(LAYER_TEXT_IDS.length).default([]),
    art: layerArtSchema.nullable().default(null),
    /** On: the customer can move, turn and resize the text and the picture ("Reposition" on the product page). */
    reposition: z.boolean().default(false),
  })
  .refine((l) => new Set(l.texts.map((t) => t.id)).size === l.texts.length, "Each text box once")
  .refine((l) => new Set(l.art?.choices ?? []).size === (l.art?.choices.length ?? 0), "Each picture once");
export type Layer = z.infer<typeof layerSchema>;

/** What the customer can reposition: each text box, and the picture. */
export const LAYER_POS_IDS = ["t1", "t2", "art"] as const;
export type LayerPosId = (typeof LAYER_POS_IDS)[number];
/**
 * Where the customer put one item: its centre (fractions of the print area), its turn in degrees, and its size as a
 * multiple of the template's box (the text's size grows with it).
 */
export type LayerPos = { cx: number; cy: number; rotate: number; scale: number };
export const LAYER_SCALE = { min: 0.5, max: 2.5 } as const;
export const layerPosSchema = z.object({ cx: z.number().finite(), cy: z.number().finite(), rotate: z.number().finite(), scale: z.number().finite() }).strict();

/** What the customer filled in. Text is the customer's own words: never logged or sent to analytics. */
export type LayerValues = { t1?: string; t2?: string; art?: string | null; pos?: Partial<Record<LayerPosId, LayerPos>> };

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

const round4 = (v: number) => Math.round(v * 10_000) / 10_000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The template's box and turn for an item, as the editor starts from. */
export function basePos(box: LayerBox, rotate = 0): LayerPos {
  return { cx: round4(box.x + box.w / 2), cy: round4(box.y + box.h / 2), rotate, scale: 1 };
}

/**
 * Applies a customer's position to a template box: resized about its centre (never past the print area), moved so
 * the box stays inside it, and turned. Returns the box, the turn and the size multiple actually used.
 */
export function placeBox(box: LayerBox, pos: LayerPos): { box: LayerBox; rotate: number; scale: number } {
  const scale = clamp(pos.scale, LAYER_SCALE.min, Math.min(LAYER_SCALE.max, 1 / box.w, 1 / box.h));
  const w = box.w * scale;
  const h = box.h * scale;
  const x = clamp(pos.cx - w / 2, 0, 1 - w);
  const y = clamp(pos.cy - h / 2, 0, 1 - h);
  const turn = ((((pos.rotate + 180) % 360) + 360) % 360) - 180;
  return { box: { x: round4(x), y: round4(y), w: round4(w), h: round4(h) }, rotate: round4(turn), scale: round4(scale) };
}

/** A position made safe: finite numbers, the centre inside the print area, a turn of ±180° and the size limits. */
export function cleanPos(raw: unknown): LayerPos | null {
  const r = layerPosSchema.safeParse(raw);
  if (!r.success) return null;
  const p = r.data;
  const turn = ((((p.rotate + 180) % 360) + 360) % 360) - 180;
  return { cx: round4(clamp(p.cx, 0, 1)), cy: round4(clamp(p.cy, 0, 1)), rotate: round4(turn), scale: round4(clamp(p.scale, LAYER_SCALE.min, LAYER_SCALE.max)) };
}

/**
 * The layer as the customer arranged it: when the template lets them reposition, each moved item's box, turn and
 * text size follow their position. Otherwise the template's own layer. Used by every drawing (preview, print file).
 */
export function positionedLayer(layer: Layer, values: LayerValues): Layer {
  const pos = values.pos;
  if (!layer.reposition || !pos) return layer;
  const texts = layer.texts.map((t) => {
    const p = pos[t.id] ? cleanPos(pos[t.id]) : null;
    if (!p) return t;
    const placed = placeBox(t.box, p);
    return { ...t, box: placed.box, rotate: placed.rotate, size: Math.min(0.5, t.size * placed.scale), minSize: Math.min(0.5, (t.minSize ?? t.size * 0.6) * placed.scale) };
  });
  const a = layer.art && pos.art ? cleanPos(pos.art) : null;
  const art = layer.art && a ? (() => {
    const placed = placeBox(layer.art.box, a);
    return { ...layer.art, box: placed.box, rotate: placed.rotate };
  })() : layer.art;
  return { ...layer, texts, art };
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
  // Positions: only when the template allows it, and only for what's filled in.
  if (layer.reposition && r.pos && typeof r.pos === "object") {
    const raw = r.pos as Record<string, unknown>;
    const pos: Partial<Record<LayerPosId, LayerPos>> = {};
    for (const t of layer.texts) {
      const p = values[t.id] ? cleanPos(raw[t.id]) : null;
      if (p) pos[t.id] = p;
    }
    const a = values.art ? cleanPos(raw.art) : null;
    if (a) pos.art = a;
    if (Object.keys(pos).length) values.pos = pos;
  }
  return { ok: true, values };
}

/** The canvas calls the layer needs; both HTML canvas and @napi-rs/canvas have them. */
export interface LayerCtx {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
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
  const { values } = input;
  if (!layerActive(input.layer)) return;
  // Where the customer put things, when the template lets them.
  const layer = positionedLayer(input.layer, values);
  ctx.save();
  if (layer.art && values.art) {
    const img = input.art.get(values.art);
    if (img && img.width > 0 && img.height > 0) {
      const r = containIn(layer.art.box, w, h, img.width, img.height);
      if (layer.art.rotate) {
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate((layer.art.rotate * Math.PI) / 180);
        ctx.drawImage(img, 0, 0, img.width, img.height, -r.w / 2, -r.h / 2, r.w, r.h);
        ctx.restore();
      } else ctx.drawImage(img, 0, 0, img.width, img.height, r.x, r.y, r.w, r.h);
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
    const lines = placeLines(fit, zone);
    if (!t.rotate) {
      for (const l of lines) ctx.fillText(l.text, l.x, l.y);
      continue;
    }
    // At an angle: turn about the box's centre, and draw the lines relative to it.
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + (zone.h ?? 0) / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((t.rotate * Math.PI) / 180);
    for (const l of lines) ctx.fillText(l.text, l.x - cx, l.y - cy);
    ctx.restore();
  }
  ctx.restore();
}

/** Line properties for the order: only what the customer filled in, under fixed names (docs/schema.md). */
export const LAYER_ATTR = { t1: "_shop_layer_t1", t2: "_shop_layer_t2", art: "_shop_layer_art", pos: "_shop_layer_pos" } as const;

/** Positions on an order line: `{"t1":[cx,cy,rotate,scale],…}`, short enough for a line property. */
export function posAttribute(pos: LayerValues["pos"]): string | null {
  if (!pos) return null;
  const out: Record<string, number[]> = {};
  for (const id of LAYER_POS_IDS) {
    const p = pos[id] ? cleanPos(pos[id]) : null;
    if (p) out[id] = [p.cx, p.cy, p.rotate, p.scale];
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

export function posFromAttribute(value: string | undefined): LayerValues["pos"] | undefined {
  if (!value) return undefined;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const pos: Partial<Record<LayerPosId, LayerPos>> = {};
    for (const id of LAYER_POS_IDS) {
      const a = raw?.[id];
      const p = Array.isArray(a) && a.length === 4 ? cleanPos({ cx: a[0], cy: a[1], rotate: a[2], scale: a[3] }) : null;
      if (p) pos[id] = p;
    }
    return Object.keys(pos).length ? pos : undefined;
  } catch {
    return undefined;
  }
}

export function layerAttributes(values: LayerValues): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  if (values.t1) out.push({ key: LAYER_ATTR.t1, value: values.t1 });
  if (values.t2) out.push({ key: LAYER_ATTR.t2, value: values.t2 });
  if (values.art) out.push({ key: LAYER_ATTR.art, value: values.art });
  const pos = out.length ? posAttribute(values.pos) : null;
  if (pos) out.push({ key: LAYER_ATTR.pos, value: pos });
  return out;
}

/** The customer's values back from an order line's properties. */
export function layerValuesFromProps(props: Record<string, string>): LayerValues | null {
  const v: LayerValues = {};
  if (props[LAYER_ATTR.t1]) v.t1 = props[LAYER_ATTR.t1];
  if (props[LAYER_ATTR.t2]) v.t2 = props[LAYER_ATTR.t2];
  if (props[LAYER_ATTR.art]) v.art = props[LAYER_ATTR.art];
  if (!Object.keys(v).length) return null;
  const pos = posFromAttribute(props[LAYER_ATTR.pos]);
  if (pos) v.pos = pos;
  return v;
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
    rotate: 0,
  };
}
