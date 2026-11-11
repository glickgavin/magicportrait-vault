/**
 * The one drawing routine for a shop preview, used by the browser (HTML canvas) and the server
 * (@napi-rs/canvas), so what the customer sees is what goes on the order line (docs/shop.md › Previews).
 * The picture is cropped to the print shape on a flat canvas, then warped onto the blank product photo
 * as a mesh of small triangles, which both canvases can draw with plain affine transforms.
 */
import type { Rect } from "./fit";
import { mesh, zoneMapper, type Point, type Template } from "./template";

export type PreviewImage = { width: number; height: number };

/** The subset of CanvasRenderingContext2D both canvases provide. */
export interface PreviewCtx {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  closePath(): void;
  clip(): void;
  fill(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: PreviewImage, ...args: number[]): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillStyle: unknown;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
}

export type MakeCanvas = (w: number, h: number) => { canvas: PreviewImage; ctx: PreviewCtx };

export type PreviewInput = {
  template: Template;
  background: PreviewImage;
  overlay: PreviewImage | null;
  picture: PreviewImage;
  /** In picture pixels: the default crop from the fit rules, or the customer's Adjust. */
  crop: Rect;
  placement: "cover" | "contain" | "wrap_zone";
  /** contain only: the colour around the picture. */
  backgroundColour: string | null;
  /** Width ÷ height of the print area (or the mug's picture zone). */
  targetAspect: number;
  /** Output size; keep the background photo's shape. */
  size: { w: number; h: number };
  makeCanvas: MakeCanvas;
  /** Longest side of the flat picture before warping (quality vs speed). */
  flatMax?: number;
};

/** Output size for a given width, in the background photo's shape. */
export function previewSize(t: Template, width: number): { w: number; h: number } {
  return { w: Math.round(width), h: Math.round((width * t.background.h) / t.background.w) };
}

function affine(s: [Point, Point, Point], d: [Point, Point, Point]) {
  const [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }] = s;
  const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(det) < 1e-9) return null;
  const solve = (u0: number, u1: number, u2: number) => [
    (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / det,
    (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / det,
    (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / det,
  ];
  const [a, c, e] = solve(d[0].x, d[1].x, d[2].x);
  const [b, dd, f] = solve(d[0].y, d[1].y, d[2].y);
  return { a, b, c, d: dd, e, f };
}

/**
 * Moves every edge of a triangle outwards by `px` (a mitred offset, capped), so neighbouring
 * triangles overlap along their whole edge and no anti-aliased seams show, even on thin triangles.
 */
export function grow(t: [Point, Point, Point], px: number): [Point, Point, Point] {
  const area = (t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y);
  const sign = area >= 0 ? 1 : -1;
  // Outward normal of edge i (from t[i] to t[i+1]).
  const normals = [0, 1, 2].map((i) => {
    const a = t[i];
    const b = t[(i + 1) % 3];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: (sign * dy) / len, y: (-sign * dx) / len };
  });
  return [0, 1, 2].map((i) => {
    const n1 = normals[(i + 2) % 3]; // edge arriving at t[i]
    const n2 = normals[i]; // edge leaving t[i]
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const bl = Math.hypot(bx, by) || 1;
    const cos = (n1.x * bx + n1.y * by) / bl; // cos of half the turn between the normals
    const dist = Math.min(px / Math.max(cos, 0.25), px * 4);
    return { x: t[i].x + (bx / bl) * dist, y: t[i].y + (by / bl) * dist };
  }) as [Point, Point, Point];
}

function triangle(ctx: PreviewCtx, img: PreviewImage, s: [Point, Point, Point], d: [Point, Point, Point]) {
  const m = affine(s, d);
  if (!m) return;
  const g = grow(d, 0.75);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g[0].x, g[0].y);
  ctx.lineTo(g[1].x, g[1].y);
  ctx.lineTo(g[2].x, g[2].y);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** The picture cropped (or fitted) to the print shape, with the template's mask, on its own canvas. */
export function flatPicture(input: Pick<PreviewInput, "picture" | "crop" | "placement" | "backgroundColour" | "targetAspect" | "makeCanvas" | "flatMax" | "template">) {
  const max = input.flatMax ?? 1200;
  const aspect = input.targetAspect > 0 ? input.targetAspect : 1;
  const fw = aspect >= 1 ? max : Math.round(max * aspect);
  const fh = aspect >= 1 ? Math.round(max / aspect) : max;
  const { canvas, ctx } = input.makeCanvas(fw, fh);
  ctx.imageSmoothingEnabled = true;
  const c = input.crop;
  if (input.placement === "contain") {
    ctx.fillStyle = input.backgroundColour ?? "#FFFFFF";
    ctx.fillRect(0, 0, fw, fh);
    const s = Math.min(fw / c.w, fh / c.h);
    const w = c.w * s;
    const h = c.h * s;
    ctx.drawImage(input.picture, c.x, c.y, c.w, c.h, (fw - w) / 2, (fh - h) / 2, w, h);
  } else {
    ctx.drawImage(input.picture, c.x, c.y, c.w, c.h, 0, 0, fw, fh);
  }
  const mask = input.template.mask;
  if (mask.kind !== "none") {
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    if (mask.kind === "circle") ctx.arc(fw / 2, fh / 2, Math.min(fw, fh) / 2, 0, Math.PI * 2);
    else {
      const r = Math.min(fw, fh) * mask.radius;
      ctx.moveTo(r, 0);
      ctx.arcTo(fw, 0, fw, fh, r);
      ctx.arcTo(fw, fh, 0, fh, r);
      ctx.arcTo(0, fh, 0, 0, r);
      ctx.arcTo(0, 0, fw, 0, r);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  return { canvas, w: fw, h: fh };
}

export function drawPreview(ctx: PreviewCtx, input: PreviewInput) {
  const { template: t, size } = input;
  const sx = size.w / t.background.w;
  const sy = size.h / t.background.h;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(input.background, 0, 0, size.w, size.h);

  const flat = flatPicture(input);
  const map = zoneMapper(t.zone, t.background.w, t.background.h);
  const [cols, rows] = t.zone.kind === "wrap" ? [32, 12] : [8, 8];
  const grid = mesh((u, v) => {
    const p = map(u, v);
    return { x: p.x * sx, y: p.y * sy };
  }, cols, rows);
  // Multiply is applied to the finished warp in one go: blending each triangle would darken the
  // thin overlaps between them into visible seams.
  const layer = t.blend === "multiply" ? input.makeCanvas(size.w, size.h) : null;
  const target = layer ? layer.ctx : ctx;
  target.save();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const s = (ii: number, jj: number): Point => ({ x: (ii / cols) * flat.w, y: (jj / rows) * flat.h });
      const d = (ii: number, jj: number): Point => grid[jj][ii];
      triangle(target, flat.canvas, [s(i, j), s(i + 1, j), s(i + 1, j + 1)], [d(i, j), d(i + 1, j), d(i + 1, j + 1)]);
      triangle(target, flat.canvas, [s(i, j), s(i + 1, j + 1), s(i, j + 1)], [d(i, j), d(i + 1, j + 1), d(i, j + 1)]);
    }
  }
  target.restore();
  target.setTransform(1, 0, 0, 1, 0, 0);
  if (layer) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }
  if (input.overlay) ctx.drawImage(input.overlay, 0, 0, size.w, size.h);
}
