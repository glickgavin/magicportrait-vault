import type { CatalogEntry, SellableVariant } from "./catalog";
import type { ShopImageKind } from "./images";
import type { VariantRules } from "./rules";

/**
 * Does a picture suit a size? One pure function, used for Product ideas, adding to the cart and
 * checkout (docs/shop.md › Product rules). Never throws.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type FitInput = { kind: ShopImageKind; width: number | null; height: number | null };
export type FitReason = "unknown_size" | "wrong_kind" | "too_small" | "too_much_crop";
export type Fit = { ok: true; cropPct: number; crop: Rect } | { ok: false; reason: FitReason; cropPct?: number };

const isPortrait = (k: ShopImageKind) => k === "portrait";

/** The shape the picture fills: the zone inside a wrap, else the whole print area. */
export function target(rules: Pick<VariantRules, "placement" | "printPx" | "zonePx">): { w: number; h: number } {
  return rules.placement === "wrap_zone" && rules.zonePx ? rules.zonePx : rules.printPx;
}

/** The largest centred rectangle of the target shape inside the picture. */
export function centredCrop(w: number, h: number, targetW: number, targetH: number): Rect {
  const ta = targetW / targetH;
  if (w / h > ta) {
    const cw = Math.round(h * ta);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / ta);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

/** Share of the picture lost to fill the print area, 0–100, rounded to one decimal. */
export function cropPercent(w: number, h: number, targetW: number, targetH: number): number {
  const ia = w / h;
  const ta = targetW / targetH;
  const kept = Math.min(ia, ta) / Math.max(ia, ta);
  return Math.round((1 - kept) * 1000) / 10;
}

export function fitVariant(img: FitInput, rules: Pick<VariantRules, "imageKinds" | "minShortSidePx" | "maxCropPct" | "placement" | "printPx" | "zonePx">): Fit {
  if (!img.width || !img.height || img.width <= 0 || img.height <= 0) return { ok: false, reason: "unknown_size" };
  if (rules.imageKinds === "portraits" && !isPortrait(img.kind)) return { ok: false, reason: "wrong_kind" };
  if (rules.imageKinds === "photos" && isPortrait(img.kind)) return { ok: false, reason: "wrong_kind" };
  if (Math.min(img.width, img.height) < rules.minShortSidePx) return { ok: false, reason: "too_small" };
  if (rules.placement === "contain") return { ok: true, cropPct: 0, crop: { x: 0, y: 0, w: img.width, h: img.height } };
  const t = target(rules);
  const pct = cropPercent(img.width, img.height, t.w, t.h);
  if (pct > rules.maxCropPct) return { ok: false, reason: "too_much_crop", cropPct: pct };
  return { ok: true, cropPct: pct, crop: centredCrop(img.width, img.height, t.w, t.h) };
}

/** A crop the customer chose with Adjust is accepted only inside the picture, in the print shape (±1%). */
export function cropAllowed(crop: Rect, img: { width: number; height: number }, rules: Pick<VariantRules, "printPx" | "zonePx" | "placement" | "maxCropPct" | "adjustable">): boolean {
  const ints = [crop.x, crop.y, crop.w, crop.h].every((n) => Number.isInteger(n));
  if (!ints || crop.w <= 0 || crop.h <= 0 || crop.x < 0 || crop.y < 0 || crop.x + crop.w > img.width || crop.y + crop.h > img.height) return false;
  if (rules.placement === "contain") return crop.x === 0 && crop.y === 0 && crop.w === img.width && crop.h === img.height;
  const t = target(rules);
  const ta = t.w / t.h;
  if (Math.abs(crop.w / crop.h - ta) / ta > 0.01) return false;
  if (!rules.adjustable) {
    const c = centredCrop(img.width, img.height, t.w, t.h);
    return Math.abs(c.x - crop.x) <= 1 && Math.abs(c.y - crop.y) <= 1 && Math.abs(c.w - crop.w) <= 1 && Math.abs(c.h - crop.h) <= 1;
  }
  return true;
}

export type IdeaVariant = SellableVariant & { fit: Extract<Fit, { ok: true }> };
export type Idea = { entry: CatalogEntry; variants: IdeaVariant[]; fromPrice: string };

/** Products on a page that suit this picture, in the collection's order, keeping only the sizes that pass. */
export function ideasFor(entries: CatalogEntry[], img: FitInput): Idea[] {
  const out: Idea[] = [];
  for (const e of entries) {
    const variants: IdeaVariant[] = [];
    for (const sv of e.sellable) {
      const f = fitVariant(img, sv.rules);
      if (f.ok) variants.push({ ...sv, fit: f });
    }
    if (!variants.length) continue;
    const fromPrice = variants.map((v) => v.variant.price).sort((a, b) => Number(a) - Number(b))[0];
    out.push({ entry: e, variants, fromPrice });
  }
  return out;
}

/** The first `count` ideas, and the rest for "See all products". */
export function topIdeas(ideas: Idea[], count: number): { top: Idea[]; rest: Idea[] } {
  return { top: ideas.slice(0, Math.max(0, count)), rest: ideas.slice(Math.max(0, count)) };
}
